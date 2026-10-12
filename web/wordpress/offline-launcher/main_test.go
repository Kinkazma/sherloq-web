package main

import (
	"archive/tar"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
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
	t.Helper()
	html, model := []byte("<!doctype html><title>offline</title>"), []byte{0, 97, 115, 109, 1, 0, 0, 0}
	meta := func(b []byte) fileMeta { return fileMeta{Size: int64(len(b)), SHA: sum(b)} }
	manifest := jsonLine(map[string]any{"schema": "sherloq.dependencies/1", "files": map[string]fileMeta{"engine/module.wasm": meta(model)}})
	c := config{Schema: "sherloq.offline-launcher/1", ArchivePath: filepath.Join(t.TempDir(), "normal.tar"), Manifest: sum(manifest), Token: strings.Repeat("a", 32), Port: 49871}
	shell := jsonLine(inventory{Schema: "sherloq.offline-shell/1", Manifest: c.Manifest, Files: map[string]fileMeta{"app.html": meta(html)}})
	c.ShellHash = sum(shell)
	f, e := os.Create(c.ArchivePath)
	if e != nil {
		t.Fatal(e)
	}
	w := tar.NewWriter(f)
	for name, data := range map[string][]byte{"manifest.json": manifest, "offline-kit.json": shell, "app/app.html": html, "engine/module.wasm": model} {
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
