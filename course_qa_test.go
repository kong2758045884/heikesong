package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAskMaterialIsolationAndPersistence(t *testing.T) {
	t.Setenv("AI_API_KEY", "")
	dir := t.TempDir()
	api := testServer(t, dir)
	first := sampleDraft()
	first.Material = "向量运算\n向量内积是对应分量乘积之和，可以用于判断正交。\n矩阵的行列式刻画有向体积缩放比例。"
	second := first
	second.Material = "和弦是多个不同音高按一定音程关系叠置的组合。"
	a, err := api.s.store.create(first, true)
	if err != nil {
		t.Fatal(err)
	}
	b, err := api.s.store.create(second, true)
	if err != nil {
		t.Fatal(err)
	}
	idA, idB := "test-student-first-material", "test-student-second-material"
	prefixA, prefixB := "/api/rooms/"+a.Code+"/", "/api/rooms/"+b.Code+"/"
	var student studentState
	api.call("POST", prefixA+"join", "", map[string]string{"sessionId": idA}, 200, &student)
	if student.Material != first.Material {
		t.Fatal("wrong student material")
	}
	api.call("POST", prefixB+"join", "", map[string]string{"sessionId": idB}, 200, nil)
	api.call("GET", prefixA+"state", idB, nil, 401, nil)
	ask := map[string]string{"question": "请问这份讲义里的内积是什么意思？"}
	api.call("POST", prefixA+"ask", idB, ask, 401, nil)
	api.call("POST", prefixA+"ask", "", ask, 401, nil)
	api.call("POST", prefixA+"ask", a.TeacherToken, ask, 401, nil)
	api.call("GET", prefixA+"ask", idA, nil, 405, nil)
	var response courseAnswer
	api.call("POST", prefixA+"ask", idA, ask, 200, &response)
	if response.Mode != "讲义检索" || !strings.Contains(first.Material, response.Source) || !strings.Contains(response.Source, "对应分量") {
		t.Fatalf("offline citation: %#v", response)
	}
	api.call("POST", prefixB+"ask", idB, ask, 200, &response)
	if response.Source != "" || !strings.Contains(response.Answer, "未检索到") {
		t.Fatalf("crossed materials: %#v", response)
	}
	api.call("POST", prefixA+"ask", idA, map[string]string{"question": "这次第二问的正确答案是哪个"}, 200, &response)
	if response.Source != "" || !strings.Contains(response.Answer, "独立") {
		t.Fatal("provided assessment answer")
	}
	api.call("POST", prefixA+"ask", idA, map[string]string{"question": first.Questions[0].Prompt}, 200, &response)
	if response.Source != "" {
		t.Fatal("accepted verbatim assessment item")
	}
	api.call("POST", prefixA+"ask", idA, map[string]string{"question": strings.Repeat("超", 301)}, 400, nil)
	stored, err := os.ReadFile(filepath.Join(dir, a.Code+".json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(stored), ask["question"]) {
		t.Fatal("stored question history")
	}
	api = testServer(t, dir)
	api.call("GET", prefixA+"state", idA, nil, 200, &student)
	if student.Material != first.Material {
		t.Fatal("material lost on restart")
	}
	var teacher struct{ Material string }
	api.call("GET", prefixA+"stats", a.TeacherToken, nil, 200, &teacher)
	if teacher.Material != first.Material {
		t.Fatal("teacher material lost")
	}
}

func TestAskAIRequiresVerbatimMaterialCitation(t *testing.T) {
	t.Setenv("AI_API_KEY", "test-key")
	t.Setenv("AI_MODEL", "test-course-model")
	api := testServer(t, t.TempDir())
	d := sampleDraft()
	d.Material = "栈帧保存当前函数的局部变量和返回位置。"
	r, err := api.s.store.create(d, false)
	if err != nil {
		t.Fatal(err)
	}
	prefix := "/api/rooms/" + r.Code + "/"
	id := "ask-upstream-guest-id"
	api.call("POST", prefix+"join", "", map[string]string{"sessionId": id}, 200, nil)
	for _, tc := range []struct {
		name                 string
		status               int
		answer, source, want string
	}{
		{"valid", 200, "栈帧会记录从哪里恢复调用。", "栈帧保存当前函数的局部变量和返回位置。", "AI 讲义问答"},
		{"invented quotation", 200, "与讲义冲突的说法。", "栈帧始终保存在硬盘。", "讲义检索"},
		{"upstream error", 503, "", "", "讲义检索"},
		{"suggested option", 200, "答案是B。", d.Material, "讲义检索"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				body, _ := io.ReadAll(req.Body)
				if req.Header.Get("Authorization") != "Bearer test-key" || req.URL.Path != "/v1/chat/completions" {
					t.Error("bad model route or auth")
				}
				if !strings.Contains(string(body), "栈帧") || strings.Contains(string(body), id) || strings.Contains(string(body), d.Questions[0].Prompt) || strings.Contains(string(body), r.TeacherToken) {
					t.Error("unexpected model context")
				}
				w.WriteHeader(tc.status)
				result, _ := json.Marshal(map[string]string{"answer": tc.answer, "source": tc.source})
				json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": string(result)}}}})
			}))
			defer up.Close()
			t.Setenv("AI_BASE_URL", up.URL+"/v1")
			var got courseAnswer
			api.call("POST", prefix+"ask", id, map[string]string{"question": "栈帧保存什么信息？"}, 200, &got)
			if got.Mode != tc.want || got.Source != d.Material {
				t.Fatalf("unexpected result: %#v", got)
			}
		})
	}
}

func TestOldRoomAndMaterialLength(t *testing.T) {
	s := testServer(t, t.TempDir())
	d := sampleDraft()
	d.Material = ""
	r, err := s.s.store.create(d, false)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(s.s.store.dir, r.Code+".json")
	file, _ := os.ReadFile(path)
	var old map[string]any
	json.Unmarshal(file, &old)
	delete(old["draft"].(map[string]any), "material")
	file, _ = json.Marshal(old)
	if err = os.WriteFile(path, file, 0600); err != nil {
		t.Fatal(err)
	}
	restored := testServer(t, s.s.store.dir)
	v, _ := restored.s.store.get(r.Code)
	if got := restored.s.askCourse(context.Background(), v, "概念是什么"); got.Source != "" || !strings.Contains(got.Answer, "尚未") {
		t.Fatalf("legacy course: %#v", got)
	}
	d.Material = strings.Repeat("甲", 6001)
	if err = validateDraft(d); err == nil {
		t.Fatal("accepted oversized material")
	}
}
