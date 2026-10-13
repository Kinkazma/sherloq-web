// SHERLOQ's verified local archive reader and first updater bridge.
// Update downloads use the explicit browser action; the TAR remains read-only. Calculations run in the user's browser, not in this helper.
package main

import (
	"archive/tar"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

type config struct {
	Schema      string `json:"schema"`
	ArchivePath string `json:"archivePath"`
	Manifest    string `json:"manifest"`
	ShellHash   string `json:"shellSha256"`
	Version     string `json:"version,omitempty"`
	Token       string `json:"token"`
	Port        int    `json:"port"`
}
type fileMeta struct {
	Size      int64    `json:"size"`
	SHA       string   `json:"sha256"`
	Type      string   `json:"type"`
	LocalOnly bool     `json:"localOnly,omitempty"`
	Chunks    []string `json:"chunks,omitempty"`
	Source    string   `json:"source,omitempty"`
}
type inventory struct {
	Schema     string              `json:"schema"`
	Manifest   string              `json:"manifest"`
	Files      map[string]fileMeta `json:"files"`
	Version    string              `json:"version,omitempty"`
	WorkerType string              `json:"workerType,omitempty"`
	Catalog    string              `json:"catalog,omitempty"`
	Chunks     map[string]int64    `json:"chunks,omitempty"`
}
type member struct{ Offset, Size int64 }
type resource struct {
	Member   member
	Meta     fileMeta
	once     sync.Once
	err      error
	External string
	Modified time.Time
}
type library struct {
	Path                                         string
	Size                                         int64
	Modified                                     time.Time
	Files                                        map[string]*resource
	LocalOnlyMissing                             map[string]bool
	Shell                                        inventory
	Manifest                                     inventory
	ShellRaw, ManifestRaw, CatalogRaw, PolicyRaw []byte
	ShellHash, ManifestHash                      string
	Selected                                     map[string]bool
	ChunkLocations                               map[string][]chunkLocation
	BridgeChunks                                 map[string]string
}

type chunkLocation struct {
	Resource     *resource
	Offset, Size int64
}
type feature struct {
	ID        string   `json:"id"`
	Group     *string  `json:"group"`
	Protected bool     `json:"protected"`
	Internal  bool     `json:"internal"`
	Depends   []string `json:"dependsOn"`
	Resources []string `json:"resources"`
}
type featureCatalog struct {
	Schema   string    `json:"schema"`
	Features []feature `json:"features"`
	Groups   []struct {
		ID string `json:"id"`
	} `json:"groups"`
}
type featurePolicy struct {
	Schema           string   `json:"schema"`
	DisabledFeatures []string `json:"disabledFeatures"`
	DisabledGroups   []string `json:"disabledGroups"`
}

var featurePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,120}$`)

func canonicalJSON(data []byte) ([]byte, error) {
	var value any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	var out bytes.Buffer
	encoder := json.NewEncoder(&out)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
func selectedFiles(catalogRaw, policyRaw []byte, manifest inventory) (map[string]bool, error) {
	selected := map[string]bool{}
	var policy featurePolicy
	if err := json.Unmarshal(policyRaw, &policy); err != nil {
		return nil, err
	}
	if policy.Schema != "sherloq.feature-policy/1" {
		return nil, errors.New("unsupported feature policy")
	}
	disabled, disabledGroups := map[string]bool{}, map[string]bool{}
	for _, id := range policy.DisabledFeatures {
		if !featurePattern.MatchString(id) {
			return nil, errors.New("invalid feature exclusions")
		}
		disabled[id] = true
	}
	for _, id := range policy.DisabledGroups {
		if !featurePattern.MatchString(id) {
			return nil, errors.New("invalid group exclusions")
		}
		disabledGroups[id] = true
	}
	if len(catalogRaw) == 0 {
		if len(disabled)+len(disabledGroups) > 0 {
			return nil, errors.New("selective archive needs its feature catalogue")
		}
		for name := range manifest.Files {
			selected[name] = true
		}
		return selected, nil
	}
	var catalog featureCatalog
	if err := json.Unmarshal(catalogRaw, &catalog); err != nil {
		return nil, err
	}
	if catalog.Schema != "sherloq.features/1" {
		return nil, errors.New("unsupported feature catalogue")
	}
	features := map[string]feature{}
	groups := map[string]bool{}
	covered := map[string]bool{}
	for _, group := range catalog.Groups {
		if !featurePattern.MatchString(group.ID) || groups[group.ID] {
			return nil, errors.New("invalid feature group")
		}
		groups[group.ID] = true
	}
	for _, f := range catalog.Features {
		if !featurePattern.MatchString(f.ID) {
			return nil, errors.New("invalid feature identity")
		}
		if _, ok := features[f.ID]; ok {
			return nil, errors.New("duplicate feature identity")
		}
		if f.Group != nil && !groups[*f.Group] {
			return nil, errors.New("unknown feature group")
		}
		features[f.ID] = f
		for _, name := range f.Resources {
			if _, ok := manifest.Files[name]; !ok {
				return nil, errors.New("unknown feature resource")
			}
			covered[name] = true
		}
	}
	if len(covered) != len(manifest.Files) {
		return nil, errors.New("feature catalogue does not cover resources")
	}
	visited, visiting := map[string]bool{}, map[string]bool{}
	var check func(string) error
	check = func(id string) error {
		f, ok := features[id]
		if !ok || visiting[id] {
			return errors.New("invalid feature dependency graph")
		}
		if visited[id] {
			return nil
		}
		visiting[id] = true
		for _, dep := range f.Depends {
			if err := check(dep); err != nil {
				return err
			}
			target := features[dep]
			if f.Protected && !target.Protected && !target.Internal {
				return errors.New("protected core requires optional feature")
			}
		}
		delete(visiting, id)
		visited[id] = true
		return nil
	}
	for id := range features {
		if err := check(id); err != nil {
			return nil, err
		}
	}
	protectedGraph := map[string]bool{}
	var protect func(string) error
	protect = func(id string) error {
		if protectedGraph[id] {
			return nil
		}
		protectedGraph[id] = true
		for _, dep := range features[id].Depends {
			target := features[dep]
			if !target.Protected && !target.Internal {
				return errors.New("protected core requires optional feature")
			}
			if err := protect(dep); err != nil {
				return err
			}
		}
		return nil
	}
	for id, f := range features {
		if f.Protected {
			if err := protect(id); err != nil {
				return nil, err
			}
		}
	}
	var enabled func(string) bool
	enabled = func(id string) bool {
		f := features[id]
		if f.Protected {
			return true
		}
		if disabled[id] || f.Group != nil && disabledGroups[*f.Group] {
			return false
		}
		for _, dep := range f.Depends {
			if !enabled(dep) {
				return false
			}
		}
		return true
	}
	chosen := map[string]bool{}
	var add func(string)
	add = func(id string) {
		if chosen[id] {
			return
		}
		chosen[id] = true
		f := features[id]
		for _, name := range f.Resources {
			selected[name] = true
		}
		for _, dep := range f.Depends {
			add(dep)
		}
	}
	for id, f := range features {
		if f.Protected || !f.Internal && enabled(id) {
			add(id)
		}
	}
	return selected, nil
}

var hashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var tokenPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)

func sum(b []byte) string { value := sha256.Sum256(b); return hex.EncodeToString(value[:]) }
func safe(name string) bool {
	if name == "" || strings.ContainsAny(name, "\\:\x00\r\n") || strings.HasPrefix(name, "/") {
		return false
	}
	for _, p := range strings.Split(name, "/") {
		if p == "" || p == "." || p == ".." {
			return false
		}
	}
	return true
}
func readConfig(name string) (config, error) {
	var c config
	b, e := os.ReadFile(name)
	if e != nil {
		return c, e
	}
	m := regexp.MustCompile(`(?s)<script id="sherloq-offline-config" type="application/json">(.*?)</script>`).FindSubmatch(b)
	if len(m) != 2 {
		return c, errors.New("choose the SHERLOQ.html generated by the application")
	}
	if e = json.Unmarshal(m[1], &c); e != nil {
		return c, e
	}
	if c.Schema != "sherloq.offline-launcher/1" || !hashPattern.MatchString(c.Manifest) || !hashPattern.MatchString(c.ShellHash) || !tokenPattern.MatchString(c.Token) || c.Port < 1024 || c.Port > 65535 {
		return c, errors.New("invalid local configuration")
	}
	if strings.HasPrefix(c.ArchivePath, "~/") {
		home, e := os.UserHomeDir()
		if e != nil {
			return c, e
		}
		c.ArchivePath = filepath.Join(home, c.ArchivePath[2:])
	}
	if !filepath.IsAbs(c.ArchivePath) {
		c.ArchivePath = filepath.Join(filepath.Dir(name), c.ArchivePath)
	}
	return c, nil
}
func openLibrary(c config) (*library, error) {
	f, e := os.Open(c.ArchivePath)
	if e != nil {
		return nil, e
	}
	defer f.Close()
	stat, e := f.Stat()
	if e != nil {
		return nil, e
	}
	members := map[string]member{}
	tr := tar.NewReader(f)
	for {
		h, e := tr.Next()
		if e == io.EOF {
			break
		}
		if e != nil {
			return nil, e
		}
		at, e := f.Seek(0, io.SeekCurrent)
		if e != nil {
			return nil, e
		}
		if (h.Typeflag != tar.TypeReg && h.Typeflag != tar.TypeRegA) || !safe(h.Name) || h.Size < 0 || at+h.Size > stat.Size() {
			return nil, errors.New("invalid archive member")
		}
		if _, exists := members[h.Name]; exists {
			return nil, errors.New("duplicate archive member")
		}
		members[h.Name] = member{at, h.Size}
	}
	read := func(name string) ([]byte, error) {
		m, ok := members[name]
		if !ok || m.Size > 20_000_000 {
			return nil, errors.New("missing/oversized archive inventory")
		}
		return io.ReadAll(io.NewSectionReader(f, m.Offset, m.Size))
	}
	shellBytes, e := read("offline-kit.json")
	if e != nil {
		return nil, e
	}
	if sum(shellBytes) != c.ShellHash {
		return nil, errors.New("application archive identity mismatch")
	}
	manifestBytes, e := read("manifest.json")
	if e != nil {
		return nil, e
	}
	// Match the publication's sorted-key compact JSON identity, without floats.
	var canonical any
	decoder := json.NewDecoder(bytes.NewReader(manifestBytes))
	decoder.UseNumber()
	if e = decoder.Decode(&canonical); e != nil {
		return nil, e
	}
	encoded, e := json.Marshal(canonical)
	if e != nil {
		return nil, e
	}
	encoded = append(encoded, '\n')
	if sum(encoded) != c.Manifest {
		return nil, errors.New("resource archive identity mismatch")
	}
	var shell, manifest inventory
	if e = json.Unmarshal(shellBytes, &shell); e != nil {
		return nil, e
	}
	if e = json.Unmarshal(manifestBytes, &manifest); e != nil {
		return nil, e
	}
	if shell.Schema != "sherloq.offline-shell/1" || manifest.Schema != "sherloq.dependencies/1" || shell.Manifest != c.Manifest {
		return nil, errors.New("unsupported archive")
	}
	catalogBytes := []byte(nil)
	if shell.Catalog != "" {
		catalogBytes, e = read("feature-catalog.json")
		if e != nil {
			catalogBytes, e = read("app/feature-catalog.json")
		}
		if e != nil || sum(catalogBytes) != shell.Catalog {
			return nil, errors.New("feature catalogue identity mismatch")
		}
	}
	policyBytes := []byte(`{"schema":"sherloq.feature-policy/1","disabledFeatures":[],"disabledGroups":[]}`)
	if _, ok := members["feature-policy.json"]; ok {
		policyBytes, e = read("feature-policy.json")
		if e != nil {
			return nil, e
		}
	}
	selected, e := selectedFiles(catalogBytes, policyBytes, manifest)
	if e != nil {
		return nil, e
	}
	for name, meta := range manifest.Files {
		if !safe(name) || !hashPattern.MatchString(meta.SHA) || meta.Size < 0 {
			return nil, errors.New("invalid resource metadata")
		}
		if len(meta.Chunks) > 0 {
			var count int64
			for _, sha := range meta.Chunks {
				size, ok := manifest.Chunks[sha]
				if !ok || !hashPattern.MatchString(sha) || size < 1 || size > 100_000_000 {
					return nil, errors.New("invalid resource chunk")
				}
				count += size
			}
			if count != meta.Size {
				return nil, errors.New("invalid resource length")
			}
		}
	}
	lib := &library{Path: c.ArchivePath, Size: stat.Size(), Modified: stat.ModTime(), Files: map[string]*resource{}, LocalOnlyMissing: map[string]bool{}, Shell: shell, Manifest: manifest, ShellRaw: shellBytes, ManifestRaw: encoded, CatalogRaw: catalogBytes, PolicyRaw: policyBytes, ShellHash: sum(shellBytes), ManifestHash: c.Manifest, Selected: selected, ChunkLocations: map[string][]chunkLocation{}, BridgeChunks: map[string]string{}}
	for i, list := range []map[string]fileMeta{shell.Files, manifest.Files} {
		for name, meta := range list {
			key := name
			if i == 0 {
				key = "app/" + name
			}
			m, ok := members[key]
			if i == 1 && !selected[name] && !ok {
				continue
			}
			if i == 1 && meta.LocalOnly && !ok {
				if !safe(name) || strings.HasPrefix(name, "private") || !hashPattern.MatchString(meta.SHA) || meta.Size < 0 {
					return nil, fmt.Errorf("invalid local-only file: %s", name)
				}
				lib.LocalOnlyMissing[name] = true
				continue
			}
			if !safe(name) || strings.HasPrefix(name, "private") || !ok || m.Size != meta.Size || !hashPattern.MatchString(meta.SHA) {
				return nil, fmt.Errorf("missing or invalid file: %s", name)
			}
			if _, ok = lib.Files[name]; ok {
				return nil, errors.New("duplicate runtime file")
			}
			item := &resource{Member: m, Meta: meta}
			lib.Files[name] = item
			if i == 1 {
				var offset int64
				for _, sha := range meta.Chunks {
					size := manifest.Chunks[sha]
					lib.ChunkLocations[sha] = append(lib.ChunkLocations[sha], chunkLocation{item, offset, size})
					offset += size
				}
			}
		}
	}
	return lib, nil
}
func (lib *library) verify(item *resource) error {
	if item.External != "" {
		stat, e := os.Stat(item.External)
		if e != nil {
			return e
		}
		if stat.Size() != item.Meta.Size || !stat.ModTime().Equal(item.Modified) {
			return errors.New("bridge file changed; restart SHERLOQ")
		}
		f, e := os.Open(item.External)
		if e != nil {
			return e
		}
		defer f.Close()
		h := sha256.New()
		if _, e = io.CopyBuffer(h, f, make([]byte, 1024*1024)); e != nil {
			return e
		}
		if hex.EncodeToString(h.Sum(nil)) != item.Meta.SHA {
			return errors.New("corrupt bridge file")
		}
		return nil
	}
	stat, e := os.Stat(lib.Path)
	if e != nil {
		return e
	}
	if stat.Size() != lib.Size || !stat.ModTime().Equal(lib.Modified) {
		return errors.New("archive changed during use; restart SHERLOQ")
	}
	item.once.Do(func() {
		f, e := os.Open(lib.Path)
		if e != nil {
			item.err = e
			return
		}
		defer f.Close()
		h := sha256.New()
		_, e = io.CopyBuffer(h, io.NewSectionReader(f, item.Member.Offset, item.Member.Size), make([]byte, 1024*1024))
		if e != nil {
			item.err = e
			return
		}
		if hex.EncodeToString(h.Sum(nil)) != item.Meta.SHA {
			item.err = errors.New("corrupt local resource")
		}
	})
	return item.err
}

func readSmallFile(name string) ([]byte, error) {
	f, err := os.Open(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if stat.Size() > 8_000_000 {
		return nil, errors.New("oversized bridge metadata")
	}
	return io.ReadAll(f)
}
func bridgeResource(name string, meta fileMeta) (*resource, error) {
	stat, err := os.Stat(name)
	if err != nil {
		return nil, err
	}
	if !stat.Mode().IsRegular() || stat.Size() != meta.Size {
		return nil, errors.New("bridge file length differs")
	}
	return &resource{Meta: meta, External: name, Modified: stat.ModTime()}, nil
}

// A bridge never changes the original TAR, HTML, token or port. Only ordinary
// reviewed files with their release SHA and length can replace older resources.
func (lib *library) applyBridge(assets, chunks string) error {
	shellBytes, err := readSmallFile(filepath.Join(assets, "offline-shell.json"))
	if err != nil {
		return err
	}
	manifestBytes, err := readSmallFile(filepath.Join(assets, "__manifest.json"))
	if err != nil {
		return err
	}
	manifestBytes, err = canonicalJSON(manifestBytes)
	if err != nil {
		return err
	}
	catalogBytes, err := readSmallFile(filepath.Join(assets, "feature-catalog.json"))
	if err != nil {
		return err
	}
	policyBytes := lib.PolicyRaw
	if info, statErr := os.Stat(filepath.Join(assets, "feature-policy.json")); statErr == nil {
		if info.Size() > 65536 {
			return errors.New("oversized explicit bridge feature policy")
		}
		policyBytes, err = readSmallFile(filepath.Join(assets, "feature-policy.json"))
		if err != nil {
			return err
		}
	} else if !os.IsNotExist(statErr) {
		return statErr
	}
	var shell, manifest inventory
	if err = json.Unmarshal(shellBytes, &shell); err != nil {
		return err
	}
	if err = json.Unmarshal(manifestBytes, &manifest); err != nil {
		return err
	}
	if shell.Schema != "sherloq.offline-shell/1" || manifest.Schema != "sherloq.dependencies/1" || sum(manifestBytes) != shell.Manifest || sum(catalogBytes) != shell.Catalog {
		return errors.New("incoherent updater bridge")
	}
	selected, err := selectedFiles(catalogBytes, policyBytes, manifest)
	if err != nil {
		return err
	}
	files := map[string]*resource{}
	missing := map[string]bool{}
	bridgeChunks := map[string]string{}
	for name, meta := range shell.Files {
		source := meta.Source
		if source == "" {
			source = name
		}
		if !safe(name) || !safe(source) || strings.HasPrefix(name, "private") || !hashPattern.MatchString(meta.SHA) || meta.Size < 0 {
			return errors.New("invalid public bridge path")
		}
		item, err := bridgeResource(filepath.Join(assets, filepath.FromSlash(source)), meta)
		if err != nil {
			return fmt.Errorf("bridge shell %s: %w", name, err)
		}
		if err = lib.verify(item); err != nil {
			return err
		}
		files[name] = item
	}
	// Preserve original objects as chunk sources, including bytes intentionally
	// hidden by the current feature policy. They are never made executable again.
	for name, meta := range manifest.Files {
		if !safe(name) || strings.HasPrefix(name, "private") || !hashPattern.MatchString(meta.SHA) || meta.Size < 0 {
			return errors.New("invalid bridge dependency")
		}
		var count int64
		for _, sha := range meta.Chunks {
			size, ok := manifest.Chunks[sha]
			if !ok || !hashPattern.MatchString(sha) || size < 1 || size > 100_000_000 {
				return errors.New("invalid bridge chunk")
			}
			count += size
		}
		if count != meta.Size {
			return errors.New("bridge resource length differs")
		}
		if old, ok := lib.Files[name]; ok && old.Meta.SHA == meta.SHA && old.Meta.Size == meta.Size {
			files[name] = old
			continue
		}
		var identical *resource
		for _, old := range lib.Files {
			if old.External == "" && old.Meta.SHA == meta.SHA && old.Meta.Size == meta.Size {
				identical = old
				break
			}
		}
		if identical != nil {
			files[name] = identical
			continue
		}
		// First bridges change a bounded JS runtime file, not a multi-gigabyte model.
		if chunks != "" && len(meta.Chunks) == 1 && meta.Chunks[0] == meta.SHA {
			item, openErr := bridgeResource(filepath.Join(chunks, meta.SHA+".bin"), meta)
			if openErr == nil {
				if err = lib.verify(item); err != nil {
					return err
				}
				files[name] = item
				bridgeChunks[meta.SHA] = item.External
				continue
			}
		}
		if !selected[name] {
			continue
		}
		if meta.LocalOnly {
			missing[name] = true
			continue
		}
		return fmt.Errorf("bridge requires verified resource: %s", name)
	}
	lib.Files = files
	lib.LocalOnlyMissing = missing
	lib.Shell = shell
	lib.Manifest = manifest
	lib.ShellRaw = shellBytes
	lib.ManifestRaw = manifestBytes
	lib.CatalogRaw = catalogBytes
	lib.PolicyRaw = policyBytes
	lib.ShellHash = sum(shellBytes)
	lib.ManifestHash = shell.Manifest
	lib.Selected = selected
	lib.BridgeChunks = bridgeChunks
	return nil
}
func (lib *library) chunk(hash string) (*os.File, int64, int64, error) {
	if !hashPattern.MatchString(hash) {
		return nil, 0, 0, errors.New("invalid chunk identity")
	}
	if name, ok := lib.BridgeChunks[hash]; ok {
		size := lib.Manifest.Chunks[hash]
		item, err := bridgeResource(name, fileMeta{SHA: hash, Size: size})
		if err != nil {
			return nil, 0, 0, err
		}
		if err = lib.verify(item); err != nil {
			return nil, 0, 0, err
		}
		file, err := os.Open(name)
		return file, 0, size, err
	}
	for _, location := range lib.ChunkLocations[hash] {
		if err := lib.verify(location.Resource); err != nil {
			continue
		}
		file, err := os.Open(lib.Path)
		if err != nil {
			return nil, 0, 0, err
		}
		at := location.Resource.Member.Offset + location.Offset
		h := sha256.New()
		_, err = io.CopyBuffer(h, io.NewSectionReader(file, at, location.Size), make([]byte, 1024*1024))
		if err == nil && hex.EncodeToString(h.Sum(nil)) == hash {
			return file, at, location.Size, nil
		}
		file.Close()
	}
	return nil, 0, 0, errors.New("verified archive chunk unavailable")
}
func (lib *library) workerType() string {
	if lib.Shell.WorkerType == "" {
		return "module"
	}
	return lib.Shell.WorkerType
}
func (lib *library) storageInventory() map[string]any {
	present := []string{}
	var size int64
	bridgeObjects := map[string]int64{}
	for hash, locations := range lib.ChunkLocations {
		if len(locations) > 0 {
			present = append(present, hash)
			size += locations[0].Size
		}
	}
	for hash := range lib.BridgeChunks {
		if len(lib.ChunkLocations[hash]) == 0 {
			present = append(present, hash)
		}
	}
	for _, item := range lib.Files {
		if item.External != "" {
			bridgeObjects[item.Meta.SHA] = item.Meta.Size
		}
	}
	var bridgeBytes int64
	for _, length := range bridgeObjects {
		bridgeBytes += length
	}
	return map[string]any{"presentChunks": present, "archiveBytes": lib.Size, "archiveResourceBytes": size, "bridgeBytes": bridgeBytes, "managedObjectBytes": 0, "managedResourceBytes": 0, "managedPresentChunks": []string{}, "protectedChunks": []string{}, "retainedBackupBytes": 0, "archiveMutable": false, "verification": "verified-on-read"}
}

const policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self' https://raw.githubusercontent.com; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

func authorizedRequest(r *http.Request, host string) bool {
	if r.Host != host {
		return false
	}
	origin := r.Header.Get("Origin")
	navigation := (r.Method == "GET" || r.Method == "HEAD") && r.Header.Get("Sec-Fetch-Mode") == "navigate" && r.Header.Get("Sec-Fetch-Dest") == "document"
	if navigation && (origin == "" || origin == "null") {
		return true
	}
	return (origin == "" || origin == "http://"+host) && r.Header.Get("Sec-Fetch-Site") != "cross-site"
}

func handler(lib *library, c config, host string, stop func()) http.Handler {
	prefix := "/" + c.Token + "/"
	bridgePrefix := "/__sherloq_bridge/" + c.Token + "/"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authorizedRequest(r, host) {
			http.Error(w, "Forbidden", 403)
			return
		}
		if expected := r.Header.Get("X-Sherloq-Release"); expected != "" && expected != lib.ShellHash {
			http.Error(w, "matching saved archive/bridge required", http.StatusConflict)
			return
		}
		if r.Header.Get("X-Sherloq-Release") != "" {
			w.Header().Set("X-Sherloq-Release", lib.ShellHash)
		}
		if r.Method != "GET" && r.Method != "HEAD" && !(r.Method == "POST" && r.URL.Path == prefix+"__stop") {
			http.Error(w, "Method not allowed", 405)
			return
		}
		bridge := strings.HasPrefix(r.URL.Path, bridgePrefix)
		requestPrefix := prefix
		if bridge {
			requestPrefix = bridgePrefix
		}
		if !strings.HasPrefix(r.URL.Path, requestPrefix) {
			http.NotFound(w, r)
			return
		}
		name := strings.TrimPrefix(r.URL.Path, requestPrefix)
		if !safe(name) {
			http.Error(w, "Invalid path", 400)
			return
		}
		h := w.Header()
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Embedder-Policy", "require-corp")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		h.Set("Content-Security-Policy", policy)
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		if bridge {
			_, shellFile := lib.Shell.Files[name]
			_, dependency := lib.Manifest.Files[name]
			if !shellFile || dependency || strings.HasPrefix(name, "__") {
				http.NotFound(w, r)
				return
			}
			serveLibraryFile(w, r, lib, name)
			return
		}
		if name == "__offline-status.json" {
			h.Set("Content-Type", "application/json")
			if r.Method != "HEAD" {
				json.NewEncoder(w).Encode(map[string]any{"complete": true, "missing": 0, "storage": "archive", "version": lib.Shell.Version, "manifest": lib.ManifestHash, "shell": lib.ShellHash, "managedStorage": false, "nativeReadOnly": true})
			}
			return
		}
		if name == "__stop" {
			if r.Method != "POST" {
				http.Error(w, "Use the launcher controls", 405)
				return
			}
			h.Set("Content-Type", "text/html; charset=utf-8")
			io.WriteString(w, "<!doctype html><meta charset=utf-8><h1>SHERLOQ arrêté / stopped</h1><p>Vous pouvez fermer cette page. / You can close this page.</p>")
			if stop != nil {
				go stop()
			}
			return
		}
		if name == "__launcher" {
			h.Set("Content-Type", "text/html; charset=utf-8")
			h.Set("Content-Security-Policy", "default-src 'none'; form-action 'self'; frame-ancestors 'none'")
			io.WriteString(w, "<!doctype html><meta charset=utf-8><title>SHERLOQ local</title><h1>SHERLOQ local</h1><p>Terminez vos calculs avant d’arrêter le lanceur. Aucun fichier ne sera supprimé.</p><p>Finish your calculations before stopping the launcher. No files will be deleted.</p><p><a href='app.html'>Ouvrir / Open SHERLOQ</a></p><form method='post' action='__stop'><button>Arrêter le lanceur / Stop launcher</button></form>")
			return
		}
		if name == "dependency-config.json" {
			h.Set("Content-Type", "application/json")
			if r.Method != "HEAD" {
				json.NewEncoder(w).Encode(map[string]any{"schema": "sherloq.dependency-config/1", "enabled": false, "offline": true, "offlineMode": "archive", "managedStorage": false, "nativeReadOnly": true, "manifest": lib.ManifestHash, "version": lib.Shell.Version, "sourceBase": "http://" + host + prefix, "updaterChannel": "https://raw.githubusercontent.com/Kinkazma/sherloq-web/main/releases/stable.json", "workerType": lib.workerType()})
			}
			return
		}
		if name == "__identity" {
			h.Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"manifest": lib.ManifestHash, "shell": lib.ShellHash, "archiveManifest": c.Manifest, "archiveShell": c.ShellHash})
			return
		}
		metadata := map[string][]byte{"__shell.json": lib.ShellRaw, "offline-shell.json": lib.ShellRaw, "__manifest.json": lib.ManifestRaw, "__features.json": lib.CatalogRaw, "__feature-policy.json": lib.PolicyRaw}
		if data, ok := metadata[name]; ok {
			if len(data) == 0 {
				http.NotFound(w, r)
				return
			}
			h.Set("Content-Type", "application/json")
			http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
			return
		}
		if name == "__managed/inventory" {
			h.Set("Content-Type", "application/json")
			if r.Method != "HEAD" {
				json.NewEncoder(w).Encode(lib.storageInventory())
			}
			return
		}
		if strings.HasPrefix(name, "__managed/chunks/") {
			hash := strings.TrimPrefix(name, "__managed/chunks/")
			file, at, size, err := lib.chunk(hash)
			if err != nil {
				http.Error(w, err.Error(), 503)
				return
			}
			defer file.Close()
			h.Set("Content-Type", "application/octet-stream")
			http.ServeContent(w, r, name, time.Time{}, io.NewSectionReader(file, at, size))
			return
		}
		if strings.HasPrefix(name, "__shell-file/") {
			name = strings.TrimPrefix(name, "__shell-file/")
			if _, ok := lib.Shell.Files[name]; !ok {
				http.NotFound(w, r)
				return
			}
		}
		if _, resource := lib.Manifest.Files[name]; resource && !lib.Selected[name] {
			http.Error(w, "FEATURE_UNINSTALLED", 410)
			return
		}
		if lib.LocalOnlyMissing[name] {
			http.Error(w, "MODEL_LOCAL_REQUIRED: import the original verified model files", 503)
			return
		}
		serveLibraryFile(w, r, lib, name)
	})
}
func serveLibraryFile(w http.ResponseWriter, r *http.Request, lib *library, name string) {
	h := w.Header()
	item, ok := lib.Files[name]
	if !ok {
		http.NotFound(w, r)
		return
	}
	if e := lib.verify(item); e != nil {
		http.Error(w, e.Error(), 503)
		return
	}
	filePath := lib.Path
	offset := item.Member.Offset
	if item.External != "" {
		filePath = item.External
		offset = 0
	}
	f, e := os.Open(filePath)
	if e != nil {
		http.Error(w, "Archive unavailable", 503)
		return
	}
	defer f.Close()
	kind := item.Meta.Type
	if kind == "" {
		switch path.Ext(name) {
		case ".js", ".mjs":
			kind = "text/javascript"
		case ".wasm":
			kind = "application/wasm"
		default:
			kind = mime.TypeByExtension(path.Ext(name))
		}
	}
	if kind == "" {
		kind = "application/octet-stream"
	}
	h.Set("Content-Type", kind)
	http.ServeContent(w, r, name, time.Time{}, io.NewSectionReader(f, offset, item.Meta.Size))
}

func launcherURL(host string, c config, lib *library, bridge bool) string {
	_, portableBootstrap := lib.Shell.Files["offline-bridge.html"]
	if bridge || portableBootstrap {
		return "http://" + host + "/__sherloq_bridge/" + c.Token + "/offline-bridge.html"
	}
	return "http://" + host + "/" + c.Token + "/app.html"
}

func defaultHTML() string {
	exe, _ := os.Executable()
	folder := filepath.Dir(exe)
	// A macOS .app keeps the HTML beside the application bundle.
	if filepath.Base(folder) == "MacOS" && filepath.Base(filepath.Dir(folder)) == "Contents" {
		folder = filepath.Dir(filepath.Dir(filepath.Dir(folder)))
	}
	return filepath.Join(folder, "SHERLOQ.html")
}
func openBrowser(url string) {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		command = exec.Command("open", url)
	case "windows":
		command = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		command = exec.Command("xdg-open", url)
	}
	if e := command.Start(); e == nil {
		go command.Wait()
	}
}
func sameInstance(host string, c config, lib *library) bool {
	client := &http.Client{Timeout: time.Second, Transport: &http.Transport{Proxy: nil}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	r, e := client.Get("http://" + host + "/" + c.Token + "/__identity")
	if e != nil {
		return false
	}
	defer r.Body.Close()
	var identity map[string]string
	return r.StatusCode == 200 && json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&identity) == nil && identity["manifest"] == lib.ManifestHash && identity["shell"] == lib.ShellHash
}

type launchOptions struct {
	NoBrowser            bool
	HTML, Assets, Chunks string
}

func launchArguments(arguments []string) (launchOptions, error) {
	var options launchOptions
	for i := 0; i < len(arguments); i++ {
		argument := arguments[i]
		if argument == "--no-browser" || argument == "-no-browser" {
			options.NoBrowser = true
			continue
		}
		name, value, found := strings.Cut(argument, "=")
		if name == "--bridge-assets" || name == "-bridge-assets" || name == "--bridge-chunks" || name == "-bridge-chunks" {
			if !found {
				i++
				if i >= len(arguments) {
					return options, errors.New("missing bridge folder")
				}
				value = arguments[i]
			}
			if value == "" {
				return options, errors.New("empty bridge folder")
			}
			if strings.HasSuffix(name, "assets") {
				options.Assets = value
			} else {
				options.Chunks = value
			}
			continue
		}
		if strings.HasPrefix(argument, "-") {
			return options, errors.New("usage: SHERLOQ [SHERLOQ.html] [--no-browser] [--bridge-assets folder] [--bridge-chunks folder]")
		}
		if options.HTML != "" {
			return options, errors.New("choose only one original SHERLOQ.html")
		}
		options.HTML = argument
	}
	return options, nil
}
func loadNativeBridge(options launchOptions) (launchOptions, error) {
	folder := filepath.Dir(defaultHTML())
	marker := filepath.Join(folder, "bridge-launch.json")
	if data, err := os.ReadFile(marker); err == nil {
		var link struct {
			Schema string `json:"schema"`
			HTML   string `json:"originalHTML"`
			Assets string `json:"assets"`
			Chunks string `json:"chunks"`
		}
		if err = json.Unmarshal(data, &link); err != nil || link.Schema != "sherloq.native-bridge/1" || link.HTML == "" {
			return options, errors.New("invalid personal bridge launcher")
		}
		if options.HTML == "" {
			options.HTML = link.HTML
		}
		if options.Assets == "" {
			if !safe(link.Assets) {
				return options, errors.New("invalid bridge assets path")
			}
			options.Assets = filepath.Join(folder, filepath.FromSlash(link.Assets))
		}
		if options.Chunks == "" && link.Chunks != "" {
			if !safe(link.Chunks) {
				return options, errors.New("invalid bridge chunks path")
			}
			options.Chunks = filepath.Join(folder, filepath.FromSlash(link.Chunks))
		}
	} else if !os.IsNotExist(err) {
		return options, err
	}
	if options.HTML == "" {
		options.HTML = defaultHTML()
	}
	return options, nil
}
func run() error {
	options, e := launchArguments(os.Args[1:])
	if e != nil {
		return e
	}
	options, e = loadNativeBridge(options)
	if e != nil {
		return e
	}
	html := options.HTML
	html, e = filepath.Abs(html)
	if e != nil {
		return e
	}
	c, e := readConfig(html)
	if e != nil {
		return e
	}
	lib, e := openLibrary(c)
	if e != nil {
		return e
	}
	if options.Assets != "" {
		if e = lib.applyBridge(options.Assets, options.Chunks); e != nil {
			return e
		}
	}
	host := fmt.Sprintf("127.0.0.1:%d", c.Port)
	url := launcherURL(host, c, lib, options.Assets != "")
	listener, e := net.Listen("tcp", host)
	if e != nil {
		if sameInstance(host, c, lib) {
			if !options.NoBrowser {
				openBrowser(url)
			}
			fmt.Println("SHERLOQ local —", url)
			return nil
		}
		return fmt.Errorf("local port unavailable: close the previous launcher after calculations before installing the bridge: %w", e)
	}
	fmt.Println("SHERLOQ local —", url)
	if !options.NoBrowser {
		openBrowser(url)
	}
	server := &http.Server{ReadHeaderTimeout: 10 * time.Second}
	stopped := make(chan struct{})
	var stopOnce sync.Once
	server.Handler = handler(lib, c, host, func() {
		stopOnce.Do(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			server.Shutdown(ctx)
			close(stopped)
		})
	})
	err := server.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		<-stopped
		return nil
	}
	return err
}
func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, "SHERLOQ:", e)
		if runtime.GOOS == "darwin" && !strings.Contains(strings.Join(os.Args[1:], " "), "--no-browser") {
			// Pass the error as data, never as AppleScript source.
			exec.Command("osascript", "-e", "on run argv\ndisplay alert \"SHERLOQ local\" message (item 1 of argv) as critical\nend run", e.Error()).Run()
		}
		os.Exit(1)
	}
}
