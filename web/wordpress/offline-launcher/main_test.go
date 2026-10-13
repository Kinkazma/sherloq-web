package main

import (
	"archive/tar"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func jsonLine(v any) []byte {
	b, _ := json.Marshal(v)
	var canonical any
	json.Unmarshal(b, &canonical)
	b, _ = json.Marshal(canonical)
	return append(b, '\n')
}
func fixture(t *testing.T) (config, *library) {
	return fixtureOptional(t, false, false)
}
func fixtureOptional(t *testing.T, includeOptional, corruptOptional bool) (config, *library) {
	t.Helper()
	html, model := []byte("<!doctype html><title>offline</title>"), []byte{0, 97, 115, 109, 1, 0, 0, 0}
	meta := func(b []byte) fileMeta { return fileMeta{Size: int64(len(b)), SHA: sum(b)} }
	optional := []byte("local model")
	optionalMeta := meta(optional)
	optionalMeta.LocalOnly = true
	manifest := jsonLine(map[string]any{"schema": "sherloq.dependencies/1", "files": map[string]fileMeta{"engine/module.wasm": meta(model), "engine/local.onnx": optionalMeta}})
	c := config{Schema: "sherloq.offline-launcher/1", ArchivePath: filepath.Join(t.TempDir(), "normal.tar"), Manifest: sum(manifest), Token: strings.Repeat("a", 32), Port: 49871}
	shell := jsonLine(inventory{Schema: "sherloq.offline-shell/1", Manifest: c.Manifest, Files: map[string]fileMeta{"app.html": meta(html)}})
	c.ShellHash = sum(shell)
	f, e := os.Create(c.ArchivePath)
	if e != nil {
		t.Fatal(e)
	}
	w := tar.NewWriter(f)
	entries := map[string][]byte{"manifest.json": manifest, "offline-kit.json": shell, "app/app.html": html, "engine/module.wasm": model}
	if includeOptional {
		entries["engine/local.onnx"] = optional
		if corruptOptional {
			entries["engine/local.onnx"] = []byte("wrong model")
		}
	}
	for name, data := range entries {
		if e = w.WriteHeader(&tar.Header{Name: name, Size: int64(len(data)), Mode: 0644}); e != nil {
			t.Fatal(e)
		}
		if _, e = w.Write(data); e != nil {
			t.Fatal(e)
		}
	}
	if e = w.Close(); e != nil {
		t.Fatal(e)
	}
	if e = f.Close(); e != nil {
		t.Fatal(e)
	}
	lib, e := openLibrary(c)
	if e != nil {
		t.Fatal(e)
	}
	return c, lib
}
func TestOptionalModelsAbsentPresentAndCorrupt(t *testing.T) {
	for _, mode := range []struct{ present, corrupt bool }{{false, false}, {true, false}, {true, true}} {
		c, lib := fixtureOptional(t, mode.present, mode.corrupt)
		host := "127.0.0.1:49871"
		h := handler(lib, c, host, nil)
		request := func(name string) *httptest.ResponseRecorder {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest("GET", "http://"+host+"/"+c.Token+"/"+name, nil))
			return w
		}
		if r := request("app.html"); r.Code != 200 {
			t.Fatal("optional model blocked application", r)
		}
		r := request("engine/local.onnx")
		if !mode.present {
			if r.Code != 503 || !strings.Contains(r.Body.String(), "MODEL_LOCAL_REQUIRED") {
				t.Fatal(r)
			}
		} else if mode.corrupt {
			if r.Code != 503 || !strings.Contains(r.Body.String(), "corrupt") {
				t.Fatal("corrupt optional model accepted", r)
			}
		} else if r.Code != 200 || r.Body.String() != "local model" {
			t.Fatal(r)
		}
	}
}
func TestOriginalFilesAndIsolation(t *testing.T) {
	c, lib := fixture(t)
	host := "127.0.0.1:49871"
	h := handler(lib, c, host, nil)
	request := func(method, name string, headers map[string]string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://"+host+"/"+c.Token+"/"+name, nil)
		for k, v := range headers {
			r.Header.Set(k, v)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	r := request("GET", "engine/module.wasm", nil)
	if r.Code != 200 || !bytes.Equal(r.Body.Bytes(), []byte{0, 97, 115, 109, 1, 0, 0, 0}) {
		t.Fatal(r)
	}
	if r.Header().Get("Cross-Origin-Embedder-Policy") != "require-corp" || !strings.Contains(r.Header().Get("Content-Security-Policy"), "connect-src 'self'") {
		t.Fatal(r.Header())
	}
	if r.Header().Get("Content-Type") != "application/wasm" {
		t.Fatal(r.Header())
	}
	r = request("GET", "engine/module.wasm", map[string]string{"Range": "bytes=1-3"})
	if r.Code != 206 || r.Body.String() != "asm" {
		t.Fatal(r)
	}
	r = request("HEAD", "engine/module.wasm", nil)
	if r.Code != 200 || r.Body.Len() != 0 || r.Header().Get("Content-Length") != "8" {
		t.Fatal(r)
	}
	r = request("GET", "dependency-config.json", nil)
	if !strings.Contains(r.Body.String(), `"offline":true`) {
		t.Fatal(r)
	}
	for _, name := range []string{"private-report.js", "not-in-manifest"} {
		if request("GET", name, nil).Code != 404 {
			t.Fatal(name)
		}
	}
	if request("GET", "../normal.tar", nil).Code != 400 {
		t.Fatal("traversal accepted")
	}
	if request("POST", "app.html", nil).Code != 405 {
		t.Fatal("write accepted")
	}
	if request("GET", "__stop", nil).Code != 405 {
		t.Fatal("GET stops server")
	}
	if request("GET", "__launcher", nil).Code != 200 {
		t.Fatal("controls absent")
	}
	if request("GET", "app.html", map[string]string{"Origin": "https://evil.test"}).Code != 403 {
		t.Fatal("foreign origin accepted")
	}
	foreign := httptest.NewRequest("GET", "http://evil.test/"+c.Token+"/app.html", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, foreign)
	if w.Code != 403 {
		t.Fatal("foreign host accepted")
	}
}
func TestIdentityAndCorruption(t *testing.T) {
	c, lib := fixture(t)
	wrong := c
	wrong.Manifest = strings.Repeat("b", 64)
	if _, e := openLibrary(wrong); e == nil {
		t.Fatal("wrong archive accepted")
	}
	stat, _ := os.Stat(c.ArchivePath)
	item := lib.Files["engine/module.wasm"]
	f, e := os.OpenFile(c.ArchivePath, os.O_WRONLY, 0)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = f.WriteAt([]byte{255}, item.Member.Offset); e != nil {
		t.Fatal(e)
	}
	f.Close()
	os.Chtimes(c.ArchivePath, stat.ModTime(), stat.ModTime())
	if e = lib.verify(item); e == nil || !strings.Contains(e.Error(), "corrupt") {
		t.Fatal("corrupt resource accepted", e)
	}
	f, _ = os.OpenFile(c.ArchivePath, os.O_APPEND|os.O_WRONLY, 0)
	io.WriteString(f, "changed")
	f.Close()
	if e = lib.verify(lib.Files["app.html"]); e == nil {
		t.Fatal("changed archive accepted")
	}
}
func TestPrivateRelativeConfig(t *testing.T) {
	c, _ := fixture(t)
	folder := filepath.Dir(c.ArchivePath)
	c.ArchivePath = "normal.tar"
	name := filepath.Join(folder, "SHERLOQ.html")
	data := append([]byte(`<script id="sherloq-offline-config" type="application/json">`), jsonLine(c)...)
	data = append(data, []byte("</script>")...)
	os.WriteFile(name, data, 0600)
	loaded, e := readConfig(name)
	if e != nil {
		t.Fatal(e)
	}
	if loaded.ArchivePath != filepath.Join(folder, "normal.tar") {
		t.Fatal(loaded)
	}
	c.Token = "invalid"
	data = append([]byte(`<script id="sherloq-offline-config" type="application/json">`), jsonLine(c)...)
	data = append(data, []byte("</script>")...)
	os.WriteFile(name, data, 0600)
	if _, e = readConfig(name); e == nil {
		t.Fatal("invalid config accepted")
	}
}
func TestStopRequiresExplicitSameOriginPost(t *testing.T) {
	c, lib := fixture(t)
	stopped := make(chan struct{}, 1)
	host := "127.0.0.1:49871"
	h := handler(lib, c, host, func() { stopped <- struct{}{} })
	request := httptest.NewRequest(http.MethodPost, "http://"+host+"/"+c.Token+"/__stop", nil)
	request.Header.Set("Origin", "http://"+host)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, request)
	if w.Code != 200 {
		t.Fatal(w)
	}
	<-stopped
}

func updaterFixture(t *testing.T, includeOptional bool) (config, *library, []byte) {
	t.Helper()
	folder := t.TempDir()
	core := []byte("kept engine")
	optional := []byte("heavy optional model")
	html := []byte("<!doctype html><title>old UI</title>")
	static := []byte(`{"enabled":false}`)
	meta := func(data []byte) fileMeta {
		return fileMeta{Size: int64(len(data)), SHA: sum(data), Chunks: []string{sum(data)}}
	}
	manifest := jsonLine(inventory{Schema: "sherloq.dependencies/1", Files: map[string]fileMeta{"engine/core.js": meta(core), "models/heavy.bin": meta(optional)}, Chunks: map[string]int64{sum(core): int64(len(core)), sum(optional): int64(len(optional))}})
	catalog := jsonLine(map[string]any{"schema": "sherloq.features/1", "groups": []map[string]string{{"id": "heavy"}}, "features": []map[string]any{{"id": "core", "protected": true, "resources": []string{"engine/core.js"}, "dependsOn": []string{}}, {"id": "heavy", "group": "heavy", "protected": false, "resources": []string{"models/heavy.bin"}, "dependsOn": []string{}}}})
	policy := []byte(`{"schema":"sherloq.feature-policy/1","disabledFeatures":["heavy"],"disabledGroups":[]}`)
	shell := jsonLine(inventory{Schema: "sherloq.offline-shell/1", Version: "old", Manifest: sum(manifest), Catalog: sum(catalog), Files: map[string]fileMeta{"app.html": {Size: int64(len(html)), SHA: sum(html)}, "dependency-config.json": {Size: int64(len(static)), SHA: sum(static)}, "feature-catalog.json": {Size: int64(len(catalog)), SHA: sum(catalog)}}})
	c := config{Schema: "sherloq.offline-launcher/1", ArchivePath: filepath.Join(folder, "selective.tar"), Manifest: sum(manifest), ShellHash: sum(shell), Token: strings.Repeat("c", 32), Port: 49871}
	file, err := os.Create(c.ArchivePath)
	if err != nil {
		t.Fatal(err)
	}
	writer := tar.NewWriter(file)
	entries := map[string][]byte{"manifest.json": manifest, "offline-kit.json": shell, "feature-catalog.json": catalog, "feature-policy.json": policy, "app/app.html": html, "app/dependency-config.json": static, "app/feature-catalog.json": catalog, "engine/core.js": core}
	if includeOptional {
		entries["models/heavy.bin"] = optional
	}
	for name, data := range entries {
		if err = writer.WriteHeader(&tar.Header{Name: name, Size: int64(len(data)), Mode: 0644}); err != nil {
			t.Fatal(err)
		}
		if _, err = writer.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	writer.Close()
	file.Close()
	lib, err := openLibrary(c)
	if err != nil {
		t.Fatal(err)
	}
	return c, lib, optional
}
func nativeRequest(lib *library, c config, method, name string) *httptest.ResponseRecorder {
	host := "127.0.0.1:49871"
	response := httptest.NewRecorder()
	handler(lib, c, host, nil).ServeHTTP(response, httptest.NewRequest(method, "http://"+host+"/"+c.Token+"/"+name, nil))
	return response
}
func TestUpdaterMetadataAndSelectiveArchive(t *testing.T) {
	for _, present := range []bool{true, false} {
		c, lib, optional := updaterFixture(t, present)
		for name, expected := range map[string][]byte{"__shell.json": lib.ShellRaw, "__manifest.json": lib.ManifestRaw, "__features.json": lib.CatalogRaw, "__feature-policy.json": lib.PolicyRaw, "__shell-file/dependency-config.json": []byte(`{"enabled":false}`)} {
			response := nativeRequest(lib, c, "GET", name)
			if response.Code != 200 || !bytes.Equal(response.Body.Bytes(), expected) {
				t.Fatalf("metadata %s differs: %s", name, response.Body.String())
			}
		}
		configuration := nativeRequest(lib, c, "GET", "dependency-config.json")
		var decoded map[string]any
		if err := json.Unmarshal(configuration.Body.Bytes(), &decoded); err != nil {
			t.Fatal(err)
		}
		if decoded["offlineMode"] != "archive" || decoded["managedStorage"] != false || decoded["nativeReadOnly"] != true || decoded["manifest"] != c.Manifest || decoded["workerType"] != "module" {
			t.Fatal(decoded)
		}
		if response := nativeRequest(lib, c, "GET", "models/heavy.bin"); response.Code != 410 {
			t.Fatal("uninstalled function became executable", response)
		}
		chunk := nativeRequest(lib, c, "GET", "__managed/chunks/"+sum(optional))
		if present {
			if chunk.Code != 200 || !bytes.Equal(chunk.Body.Bytes(), optional) {
				t.Fatal("disabled original bytes cannot be reused", chunk)
			}
		} else if chunk.Code == 200 {
			t.Fatal("absent optional bytes invented")
		}
		if response := nativeRequest(lib, c, "GET", "__managed/inventory"); response.Code != 200 || !strings.Contains(response.Body.String(), `"archiveMutable":false`) || !strings.Contains(response.Body.String(), `"managedPresentChunks":[]`) {
			t.Fatal(response)
		}
		if response := nativeRequest(lib, c, "PUT", "__managed/objects/"+sum(optional)); response.Code != 405 {
			t.Fatal("native read-only helper accepted update writes")
		}
	}
}
func TestFirstBridgePreservesOriginalArchiveOriginAndVerifiedReplacement(t *testing.T) {
	c, lib, _ := updaterFixture(t, true)
	before, err := os.ReadFile(c.ArchivePath)
	if err != nil {
		t.Fatal(err)
	}
	assets := t.TempDir()
	chunks := t.TempDir()
	newHTML := []byte("<!doctype html><title>new UI with updater</title>")
	replacement := []byte("reviewed six-file runtime overlay sample")
	manifest := lib.Manifest
	manifest.Files["engine/core.js"] = fileMeta{Size: int64(len(replacement)), SHA: sum(replacement), Chunks: []string{sum(replacement)}}
	manifest.Chunks[sum(replacement)] = int64(len(replacement))
	manifestBytes := jsonLine(manifest)
	static := []byte(`{"offline":true}`)
	shell := inventory{Schema: "sherloq.offline-shell/1", Version: "new", WorkerType: "classic", Manifest: sum(manifestBytes), Catalog: sum(lib.CatalogRaw), Files: map[string]fileMeta{"app.html": {Size: int64(len(newHTML)), SHA: sum(newHTML)}, "dependency-config.json": {Size: int64(len(static)), SHA: sum(static)}, "feature-catalog.json": {Size: int64(len(lib.CatalogRaw)), SHA: sum(lib.CatalogRaw)}}}
	for name, data := range map[string][]byte{"offline-shell.json": jsonLine(shell), "__manifest.json": manifestBytes, "feature-catalog.json": lib.CatalogRaw, "app.html": newHTML, "dependency-config.json": static} {
		if err = os.WriteFile(filepath.Join(assets, name), data, 0644); err != nil {
			t.Fatal(err)
		}
	}
	os.WriteFile(filepath.Join(chunks, sum(replacement)+".bin"), replacement, 0644)
	if err = lib.applyBridge(assets, chunks); err != nil {
		t.Fatal(err)
	}
	if response := nativeRequest(lib, c, "GET", "dependency-config.json"); !strings.Contains(response.Body.String(), `"workerType":"classic"`) {
		t.Fatal("shipping classic worker type lost", response)
	}
	if response := nativeRequest(lib, c, "GET", "app.html"); response.Code != 200 || !bytes.Equal(response.Body.Bytes(), newHTML) {
		t.Fatal(response)
	}
	if response := nativeRequest(lib, c, "GET", "engine/core.js"); response.Code != 200 || !bytes.Equal(response.Body.Bytes(), replacement) {
		t.Fatal(response)
	}
	if response := nativeRequest(lib, c, "GET", "__managed/chunks/"+sum(replacement)); response.Code != 200 || !bytes.Equal(response.Body.Bytes(), replacement) {
		t.Fatal(response)
	}
	if response := nativeRequest(lib, c, "GET", "models/heavy.bin"); response.Code != 410 {
		t.Fatal("bridge reactivated a removed feature")
	}
	if response := nativeRequest(lib, c, "GET", "__shell-file/dependency-config.json"); response.Code != 200 || !bytes.Equal(response.Body.Bytes(), static) {
		t.Fatal(response)
	}
	after, _ := os.ReadFile(c.ArchivePath)
	if !bytes.Equal(before, after) {
		t.Fatal("bridge modified original TAR")
	}
	if c.Port != 49871 || c.Token != strings.Repeat("c", 32) {
		t.Fatal("bridge changed original origin")
	}
	os.WriteFile(filepath.Join(assets, "app.html"), []byte("corrupt bridge"), 0644)
	if response := nativeRequest(lib, c, "GET", "app.html"); response.Code != 503 {
		t.Fatal("corrupt bridge files served")
	}
}
func TestSelectiveGraphRejectsUnsafeRecoveryAndLaunchArguments(t *testing.T) {
	_, lib, _ := updaterFixture(t, false)
	bad := []byte(`{"schema":"sherloq.features/1","groups":[],"features":[{"id":"core","protected":true,"resources":["engine/core.js","models/heavy.bin"],"dependsOn":["core"]}]}`)
	if _, err := selectedFiles(bad, lib.PolicyRaw, lib.Manifest); err == nil {
		t.Fatal("protected dependency cycle accepted")
	}
	if _, err := selectedFiles(nil, lib.PolicyRaw, lib.Manifest); err == nil {
		t.Fatal("selective choices lost without catalogue")
	}
	for _, arguments := range [][]string{{"old/SHERLOQ.html", "--bridge-assets", "assets", "--bridge-chunks=chunks", "--no-browser"}, {"--no-browser", "--bridge-assets=assets", "old/SHERLOQ.html", "--bridge-chunks", "chunks"}} {
		options, err := launchArguments(arguments)
		if err != nil || options.HTML != "old/SHERLOQ.html" || options.Assets != "assets" || options.Chunks != "chunks" || !options.NoBrowser {
			t.Fatal(options, err)
		}
	}
	if _, err := launchArguments([]string{"--bridge-assets"}); err == nil {
		t.Fatal("missing bridge argument accepted")
	}
}

func TestExplicitBridgePolicyExcludesNewOptionalModelsBeforeCheckingFiles(t *testing.T) {
	c, lib, _ := updaterFixture(t, true)
	lib.PolicyRaw = []byte(`{"schema":"sherloq.feature-policy/1","disabledFeatures":[],"disabledGroups":[]}`)
	assets := t.TempDir()
	newBytes := []byte("new optional model absent deliberately")
	manifest := lib.Manifest
	manifest.Files = map[string]fileMeta{}
	for name, meta := range lib.Manifest.Files {
		manifest.Files[name] = meta
	}
	manifest.Files["models/new.bin"] = fileMeta{Size: int64(len(newBytes)), SHA: sum(newBytes), Chunks: []string{sum(newBytes)}}
	manifest.Chunks[sum(newBytes)] = int64(len(newBytes))
	catalog := jsonLine(map[string]any{"schema": "sherloq.features/1", "groups": []map[string]string{{"id": "heavy"}}, "features": []map[string]any{{"id": "core", "protected": true, "resources": []string{"engine/core.js"}, "dependsOn": []string{}}, {"id": "heavy", "group": "heavy", "resources": []string{"models/heavy.bin", "models/new.bin"}, "dependsOn": []string{}}}})
	ui := []byte("new selective UI")
	manifestBytes := jsonLine(manifest)
	shell := jsonLine(inventory{Schema: "sherloq.offline-shell/1", Version: "new", Manifest: sum(manifestBytes), Catalog: sum(catalog), Files: map[string]fileMeta{"app.html": {Size: int64(len(ui)), SHA: sum(ui)}}})
	for name, data := range map[string][]byte{"app.html": ui, "offline-shell.json": shell, "__manifest.json": manifestBytes, "feature-catalog.json": catalog} {
		os.WriteFile(filepath.Join(assets, name), data, 0644)
	}
	if err := lib.applyBridge(assets, ""); err == nil {
		t.Fatal("a missing new public model was silently ignored without an explicit choice")
	}
	policy := []byte(`{"schema":"sherloq.feature-policy/1","disabledFeatures":[],"disabledGroups":["heavy"]}`)
	os.WriteFile(filepath.Join(assets, "feature-policy.json"), policy, 0644)
	if err := lib.applyBridge(assets, ""); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(lib.PolicyRaw, policy) {
		t.Fatal("explicit group choice was not retained")
	}
	if response := nativeRequest(lib, c, "GET", "models/new.bin"); response.Code != 410 {
		t.Fatal("new inherited disabled-group function was revived")
	}
}

func TestFallbackCannotMixAClientReleaseWithAnotherArchiveShell(t *testing.T) {
	c, lib := fixture(t)
	host := "127.0.0.1:49871"
	serve := handler(lib, c, host, nil)
	for _, expected := range []string{lib.ShellHash, strings.Repeat("b", 64)} {
		request := httptest.NewRequest("GET", "http://"+host+"/"+c.Token+"/app.html", nil)
		request.Header.Set("X-Sherloq-Release", expected)
		response := httptest.NewRecorder()
		serve.ServeHTTP(response, request)
		if expected == lib.ShellHash {
			if response.Code != http.StatusOK || response.Header().Get("X-Sherloq-Release") != expected {
				t.Fatal("matching saved shell rejected", response)
			}
		} else if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), "matching saved archive/bridge required") || response.Header().Get("X-Sherloq-Release") == expected {
			t.Fatal("another client release received a mixed shell", response)
		}
	}
	request := httptest.NewRequest("GET", "http://"+host+"/"+c.Token+"/__shell.json", nil)
	request.Header.Set("X-Sherloq-Release", lib.ShellHash)
	response := httptest.NewRecorder()
	serve.ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Header().Get("X-Sherloq-Release") != lib.ShellHash || sum(response.Body.Bytes()) != lib.ShellHash {
		t.Fatal("selected metadata did not confirm its exact release", response)
	}
}

func TestBridgeOutsideLegacyWorkerScopeOnlyServesVerifiedShellFiles(t *testing.T) {
	c, lib, _ := updaterFixture(t, true)
	host := "127.0.0.1:49871"
	h := handler(lib, c, host, nil)
	prefix := "/__sherloq_bridge/" + c.Token + "/"
	request := func(method, name string, headers map[string]string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "http://"+host+prefix+name, nil)
		for key, value := range headers {
			req.Header.Set(key, value)
		}
		response := httptest.NewRecorder()
		h.ServeHTTP(response, req)
		return response
	}
	for _, name := range []string{"app.html", "dependency-config.json", "feature-catalog.json"} {
		response := request("GET", name, map[string]string{"X-Sherloq-Release": lib.ShellHash})
		if response.Code != 200 || sum(response.Body.Bytes()) != lib.Shell.Files[name].SHA || response.Header().Get("X-Sherloq-Release") != lib.ShellHash {
			t.Fatalf("outside shell %s: %v", name, response)
		}
		if response.Header().Get("Cross-Origin-Embedder-Policy") != "require-corp" || response.Header().Get("Cache-Control") != "no-store" || response.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal(response.Header())
		}
		if head := request("HEAD", name, nil); head.Code != 200 || head.Body.Len() != 0 || head.Header().Get("Content-Length") == "" {
			t.Fatal(head)
		}
	}
	for _, name := range []string{"engine/core.js", "models/heavy.bin", "__managed/inventory", "__managed/chunks/" + lib.Manifest.Files["engine/core.js"].SHA, "__shell.json", "__manifest.json", "__features.json", "__offline-status.json", "__stop", "unknown.js"} {
		if response := request("GET", name, nil); response.Code != 404 {
			t.Fatalf("outside bridge exposed %s: %d", name, response.Code)
		}
	}
	if response := request("GET", "../app.html", nil); response.Code != 400 {
		t.Fatal("outside traversal accepted", response)
	}
	if response := request("POST", "app.html", nil); response.Code != 405 {
		t.Fatal("outside write accepted", response)
	}
	if response := request("GET", "app.html", map[string]string{"Origin": "https://evil.test"}); response.Code != 403 {
		t.Fatal("outside foreign origin accepted", response)
	}
	if response := request("GET", "app.html", map[string]string{"X-Sherloq-Release": strings.Repeat("b", 64)}); response.Code != 409 {
		t.Fatal("outside release mismatch accepted", response)
	}
	foreign := httptest.NewRequest("GET", "http://evil.test"+prefix+"app.html", nil)
	response := httptest.NewRecorder()
	h.ServeHTTP(response, foreign)
	if response.Code != 403 {
		t.Fatal("outside foreign host accepted", response)
	}
	wrongToken := httptest.NewRequest("GET", "http://"+host+"/__sherloq_bridge/"+strings.Repeat("b", 32)+"/app.html", nil)
	response = httptest.NewRecorder()
	h.ServeHTTP(response, wrongToken)
	if response.Code != 404 {
		t.Fatal("outside wrong token accepted", response)
	}
	// A fresh request checks actual shell body SHA, even outside the former SW scope.
	brokenConfig, broken, _ := updaterFixture(t, true)
	broken.Files["app.html"].Meta.SHA = strings.Repeat("f", 64)
	response = httptest.NewRecorder()
	handler(broken, brokenConfig, host, nil).ServeHTTP(response, httptest.NewRequest("GET", "http://"+host+"/__sherloq_bridge/"+brokenConfig.Token+"/app.html", nil))
	if response.Code != 503 {
		t.Fatal("unverified outside body accepted", response)
	}
	if launcherURL(host, c, lib, true) != "http://"+host+prefix+"offline-bridge.html" || launcherURL(host, c, lib, false) != "http://"+host+"/"+c.Token+"/app.html" {
		t.Fatal("launcher did not preserve token/origin and select outside bootstrap")
	}
}

func TestArchiveOfflineStatusIncludesExplicitReadOnlyStorage(t *testing.T) {
	c, lib, _ := updaterFixture(t, false)
	response := nativeRequest(lib, c, "GET", "__offline-status.json")
	var status map[string]any
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &status) != nil {
		t.Fatal(response)
	}
	if status["complete"] != true || status["missing"] != float64(0) || status["storage"] != "archive" || status["version"] != lib.Shell.Version || status["manifest"] != lib.ManifestHash || status["shell"] != lib.ShellHash || status["managedStorage"] != false || status["nativeReadOnly"] != true {
		t.Fatal(status)
	}
	if response = nativeRequest(lib, c, "HEAD", "__offline-status.json"); response.Code != 200 || response.Body.Len() != 0 {
		t.Fatal(response)
	}
}

func TestNewArchiveSelectsBootstrapWithoutPrivateBridgeMarker(t *testing.T) {
	c, lib, _ := updaterFixture(t, false)
	host := "127.0.0.1:49871"
	originalURL := launcherURL(host, c, lib, false)
	if originalURL != "http://"+host+"/"+c.Token+"/app.html" {
		t.Fatal("old archives must retain their traditional launch", originalURL)
	}
	originalIdentity := lib.ShellHash
	originalToken := c.Token
	originalPort := c.Port
	lib.Shell.Files["offline-bridge.html"] = fileMeta{Size: 1, SHA: strings.Repeat("a", 64)}
	newURL := launcherURL(host, c, lib, false)
	if newURL != "http://"+host+"/__sherloq_bridge/"+c.Token+"/offline-bridge.html" {
		t.Fatal("new portable archive did not select outside bootstrap", newURL)
	}
	if lib.ShellHash != originalIdentity || c.Token != originalToken || c.Port != originalPort {
		t.Fatal("URL selection changed archive identity or origin")
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(c.ArchivePath), "bridge-launch.json")); !os.IsNotExist(err) {
		t.Fatal("new archive required private marker", err)
	}
}

func TestPortableSelectiveArchiveWithGeneratedPairedHTML(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node is required to exercise the production HTML download generator")
	}
	folder := t.TempDir()
	core := []byte("verified tiny engine")
	optional := []byte("excluded optional model")
	server, err := os.ReadFile("../sherloq-browser/assets/offline-server.py")
	if err != nil {
		t.Fatal(err)
	}
	bootstrap := []byte("<!doctype html><title>portable native contract</title>")
	html := []byte("<!doctype html><title>portable application fixture</title>")
	workspace := []byte("export const portableContract = true;")
	meta := func(data []byte) fileMeta {
		return fileMeta{Size: int64(len(data)), SHA: sum(data), Chunks: []string{sum(data)}}
	}
	manifest := jsonLine(inventory{Schema: "sherloq.dependencies/1", Files: map[string]fileMeta{"engine/core.js": meta(core), "models/optional.bin": meta(optional)}, Chunks: map[string]int64{sum(core): int64(len(core)), sum(optional): int64(len(optional))}})
	catalog := jsonLine(map[string]any{"schema": "sherloq.features/1", "groups": []map[string]string{{"id": "optional"}}, "features": []map[string]any{{"id": "core", "protected": true, "resources": []string{"engine/core.js"}, "dependsOn": []string{}}, {"id": "optional", "group": "optional", "protected": false, "resources": []string{"models/optional.bin"}, "dependsOn": []string{}}}})
	policy := []byte(`{"schema":"sherloq.feature-policy/1","disabledFeatures":["optional"],"disabledGroups":[]}`)
	shell := inventory{Schema: "sherloq.offline-shell/1", Version: "0.18.0-local.portable", Manifest: sum(manifest), Catalog: sum(catalog), WorkerType: "classic", Files: map[string]fileMeta{"app.html": meta(html), "workspace-entry.js": meta(workspace), "offline-bridge.html": meta(bootstrap), "offline-server.py": meta(server), "feature-catalog.json": meta(catalog)}}
	shellRaw := jsonLine(shell)
	token := strings.Repeat("e", 32)
	port := 49871
	host := "127.0.0.1:49871"
	archive := filepath.Join(folder, "SHERLOQ-complet.tar")
	file, err := os.Create(archive)
	if err != nil {
		t.Fatal(err)
	}
	writer := tar.NewWriter(file)
	for name, body := range map[string][]byte{"manifest.json": manifest, "offline-kit.json": shellRaw, "feature-catalog.json": catalog, "feature-policy.json": policy, "app/app.html": html, "app/workspace-entry.js": workspace, "app/offline-bridge.html": bootstrap, "app/offline-server.py": server, "app/feature-catalog.json": catalog, "engine/core.js": core} {
		if err = writer.WriteHeader(&tar.Header{Name: name, Size: int64(len(body)), Mode: 0644}); err != nil {
			t.Fatal(err)
		}
		if _, err = writer.Write(body); err != nil {
			t.Fatal(err)
		}
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	file.Close()
	input := map[string]any{"shell": shell, "shellRaw": string(shellRaw), "manifestRaw": string(manifest), "identity": sum(shellRaw), "appBase": "http://" + host + "/" + token + "/", "server": string(server)}
	script := `import {webcrypto} from 'node:crypto';import {createOfflineLauncherDownload} from './sherloq-browser/assets/offline-launcher-download.js';let raw='';for await(const data of process.stdin)raw+=data;const input=JSON.parse(raw),plan={appBase:new URL(input.appBase),shell:input.shell,shellBytes:new TextEncoder().encode(input.shellRaw),manifestBytes:new TextEncoder().encode(input.manifestRaw),identity:input.identity,local:true,config:{offline:true,offlineMode:'archive'}};const result=await createOfflineLauncherDownload(plan,{language:'fr',crypto:webcrypto,fetcher:async()=>new Response(input.server),storage:null});process.stdout.write(result.html);`
	cmd := exec.Command(node, "--input-type=module", "-e", script)
	cmd.Dir = ".."
	cmd.Stdin = bytes.NewReader(jsonLine(input))
	generated, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("production HTML generator: %v %s", err, generated)
	}
	if !bytes.Contains(generated, []byte(`href="http://`+host+`/__sherloq_bridge/`+token+`/offline-bridge.html#lang=fr"`)) {
		t.Fatal("paired HTML bypassed the bootstrap outside the previous worker scope")
	}
	launcher := filepath.Join(folder, "SHERLOQ.html")
	if err = os.WriteFile(launcher, generated, 0600); err != nil {
		t.Fatal(err)
	}
	c, err := readConfig(launcher)
	if err != nil {
		t.Fatal(err)
	}
	if c.ArchivePath != archive || c.Port != port || c.Token != token || c.Manifest != sum(manifest) || c.ShellHash != sum(shellRaw) || c.Version != shell.Version {
		t.Fatal("paired HTML lost identity or original origin", c)
	}
	lib, err := openLibrary(c)
	if err != nil {
		t.Fatal("selective archive did not open with paired HTML", err)
	}
	if launcherURL(host, c, lib, false) != "http://"+host+"/__sherloq_bridge/"+token+"/offline-bridge.html" {
		t.Fatal("portable archive used stale application scope")
	}
	if response := nativeRequest(lib, c, "GET", "engine/core.js"); response.Code != 200 || !bytes.Equal(response.Body.Bytes(), core) {
		t.Fatal(response)
	}
	if response := nativeRequest(lib, c, "GET", "models/optional.bin"); response.Code != 410 {
		t.Fatal("selective archive reenabled omitted function", response)
	}
	if response := nativeRequest(lib, c, "GET", "__shell.json"); response.Code != 200 || sum(response.Body.Bytes()) != c.ShellHash {
		t.Fatal("paired shell identity lost", response)
	}
	req := httptest.NewRequest("GET", "http://"+host+"/__sherloq_bridge/"+token+"/offline-bridge.html", nil)
	response := httptest.NewRecorder()
	handler(lib, c, host, nil).ServeHTTP(response, req)
	if response.Code != 200 || !bytes.Equal(response.Body.Bytes(), bootstrap) {
		t.Fatal("portable bootstrap body differs", response)
	}
	if _, err = os.Stat(filepath.Join(folder, "bridge-launch.json")); !os.IsNotExist(err) {
		t.Fatal("portable pair relies on private marker", err)
	}
	stat, err := os.Stat(archive)
	if err != nil || stat.Size() > 2*1024*1024 {
		t.Fatal("tiny qualification unexpectedly copied models", stat, err)
	}
}

func TestFileLauncherNavigationCannotAuthorizeCrossSiteFetchesOrMutations(t *testing.T) {
	c, lib := fixture(t)
	host := "127.0.0.1:49871"
	stopped := false
	h := handler(lib, c, host, func() { stopped = true })
	request := func(method, name, origin, mode, destination, requestHost string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://"+host+"/"+c.Token+"/"+name, nil)
		r.Host = requestHost
		r.Header.Set("Sec-Fetch-Site", "cross-site")
		r.Header.Set("Sec-Fetch-Mode", mode)
		r.Header.Set("Sec-Fetch-Dest", destination)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		response := httptest.NewRecorder()
		h.ServeHTTP(response, r)
		return response
	}
	for _, method := range []string{"GET", "HEAD"} {
		for _, origin := range []string{"", "null"} {
			response := request(method, "app.html", origin, "navigate", "document", host)
			if response.Code != 200 {
				t.Fatal("file launcher navigation rejected", method, origin, response)
			}
			if method == "HEAD" && response.Body.Len() != 0 {
				t.Fatal("HEAD rendered a body", response)
			}
		}
	}
	for _, test := range []struct{ method, name, origin, mode, destination, host string }{
		{"GET", "app.html", "", "cors", "document", host},
		{"GET", "app.html", "null", "navigate", "iframe", host},
		{"GET", "app.html", "https://foreign.invalid", "navigate", "document", host},
		{"GET", "app.html", "", "navigate", "document", "evil.test"},
		{"POST", "__stop", "", "navigate", "document", host},
		{"POST", "__stop", "null", "navigate", "document", host},
		{"POST", "__stop", "http://" + host, "navigate", "document", host},
		{"PUT", "__managed/objects/" + strings.Repeat("a", 64), "", "navigate", "document", host},
	} {
		if response := request(test.method, test.name, test.origin, test.mode, test.destination, test.host); response.Code != 403 {
			t.Fatal("cross-site request accepted", test, response)
		}
	}
	if stopped {
		t.Fatal("file navigation authorization stopped the native launcher")
	}
}
