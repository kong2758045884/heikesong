package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

func TestCopilotPPTXNativeElements(t *testing.T) {
	b, err := os.ReadFile("web/copilot-demo.pptx")
	if err != nil {
		t.Fatal(err)
	}
	pages, media, err := extractPPTX(b, "递归课件.pptx")
	if err != nil {
		t.Fatal(err)
	}
	if len(pages) != 2 || pages[0].Title != "调用如何进入栈帧" || pages[1].Title != "逐层返回与求和公式" || len(media) != 1 {
		t.Fatalf("pages/media: %+v / %d", pages, len(media))
	}
	kinds := map[string]bool{}
	for _, p := range pages {
		for _, el := range p.Elements {
			kinds[el.Kind] = true
			if el.Kind == "image" && (media[el.Image].Mime != "image/png" || !strings.Contains(el.Text, "栈顶")) {
				t.Fatal("lost image or caption")
			}
			if el.Kind == "formula" && !strings.Contains(el.Text, "(n(n + 1)) / (2)") {
				t.Fatalf("flattened equation: %s", el.Text)
			}
			if el.Kind == "code" && !strings.Contains(el.Text, "    return n + total(n - 1)") {
				t.Fatalf("lost code indentation: %s", el.Text)
			}
		}
	}
	for _, name := range []string{"image", "text", "code", "formula"} {
		if !kinds[name] {
			t.Fatalf("missing %s", name)
		}
	}
	if _, _, e := extractPPTX([]byte("not a presentation"), "sample.pptx"); e == nil {
		t.Fatal("invalid package accepted")
	}
}

func TestCopilotPrivacySyncAndOptionalAI(t *testing.T) {
	t.Setenv("AI_API_KEY", "")
	t.Setenv("AI_MODEL", "")
	dir := t.TempDir()
	s := testServer(t, dir).s
	teacher := platformClient{t: t, s: s}
	student, other := teacher, teacher
	teacher.register("课件教师", "teacher")
	student.register("课件学生", "student")
	other.register("课件同学", "student")
	var course struct{ Course courseBrief }
	teacher.call("POST", "/api/courses", "", map[string]string{"name": "Python 程序设计", "className": "试验班"}, 200, &course)
	var c struct{ Code, TeacherToken string }
	teacher.call("POST", "/api/rooms", "", map[string]any{"draft": sampleDraft(), "feedback": true, "courseId": course.Course.ID}, 200, &c)
	room := "/api/rooms/" + c.Code
	route := room + "/copilot/"
	student.call("GET", route+"state", "", nil, 401, nil)
	student.call("POST", room+"/join", "", map[string]string{}, 200, nil)
	other.call("POST", room+"/join", "", map[string]string{}, 200, nil)
	var deck struct {
		Page   pilotPage
		Groups []pilotGroup
		Pages  []struct{ ID string }
	}
	teacher.call("GET", route+"state", c.TeacherToken, nil, 200, &deck)
	initial := deck.Page.ID
	body := map[string]any{"title": "求和代码", "elements": []pilotElement{{Kind: "code", Text: "def total(n):\n    return sum(range(n + 1))"}}}
	student.call("POST", route+"pages", c.TeacherToken, body, 403, nil)
	teacher.call("POST", route+"pages", c.TeacherToken, body, 200, &deck)
	newPage := deck.Page.ID
	var studView map[string]any
	student.call("GET", route+"state", "", nil, 200, &studView)
	if studView["pages"] != nil || studView["groups"] != nil || studView["page"].(map[string]any)["id"] != newPage {
		t.Fatalf("bad student view %+v", studView)
	}
	var ans courseAnswer
	q := pilotQuestion{PageID: newPage, ElementID: "e1", Question: "这里的代码中参数代表什么？"}
	student.call("POST", route+"ask", "", q, 200, &ans)
	if ans.Source == "" {
		t.Fatalf("missing evidence: %+v", ans)
	}
	teacher.call("GET", route+"state", c.TeacherToken, nil, 200, &deck)
	if len(deck.Groups) != 0 {
		t.Fatal("a private question was shared")
	}
	var calls atomic.Int32
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var payload map[string]any
		if e := json.NewDecoder(r.Body).Decode(&payload); e != nil {
			t.Error(e)
		}
		b, _ := json.Marshal(payload)
		if strings.Contains(string(b), c.TeacherToken) || strings.Contains(string(b), "课件学生") {
			t.Error("sent identifying field")
		}
		a := `{"group":"代码执行","summary":"学生在区分函数的输入与当前层参数。","suggestion":"用两个连续输入记录每一层参数。"}`
		json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": a}}}})
	}))
	defer mock.Close()
	t.Setenv("AI_API_KEY", "mock-only")
	t.Setenv("AI_MODEL", "test")
	t.Setenv("AI_BASE_URL", mock.URL)
	student.call("POST", route+"share", "", q, 200, nil)
	if calls.Load() != 0 {
		t.Fatal("classification opt-in ignored")
	}
	q.AllowAI = true
	q.Question = "代码的参数如何传入？"
	other.call("POST", route+"share", "", q, 200, nil)
	other.call("POST", route+"share", "", q, 200, nil)
	if calls.Load() != 1 {
		t.Fatalf("classification count %d", calls.Load())
	}
	teacher.call("GET", route+"state", c.TeacherToken, nil, 200, &deck)
	if len(deck.Groups) != 1 || deck.Groups[0].Count != 2 || deck.Groups[0].Mode != "AI 与规则归类" || deck.Groups[0].Summary == "" {
		t.Fatalf("group %+v", deck.Groups)
	}
	teacher.call("POST", route+"current", c.TeacherToken, map[string]string{"pageId": initial}, 200, nil)
	student.call("POST", route+"ask", "", q, 409, nil)
	raw, _ := os.ReadFile("web/copilot-demo.pptx")
	req := httptest.NewRequest("POST", route+"import?filename=class.pptx", bytes.NewReader(raw))
	req.AddCookie(teacher.cookie)
	req.Header.Set("Authorization", "Bearer "+c.TeacherToken)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("upload: %d %s", w.Code, w.Body.String())
	}
	if e := json.Unmarshal(w.Body.Bytes(), &deck); e != nil {
		t.Fatal(e)
	}
	img := ""
	for _, el := range deck.Page.Elements {
		if el.Kind == "image" {
			img = el.Image
		}
	}
	var image map[string]string
	student.call("GET", route+"image?id="+img, "", nil, 200, &image)
	if !strings.HasPrefix(image["data"], "data:image/png;base64,") {
		t.Fatal("missing supported image")
	}
	restarted := testServer(t, dir).s
	student.s = restarted
	teacher.s = restarted
	teacher.call("POST", route+"current", c.TeacherToken, map[string]string{"pageId": initial}, 200, &deck)
	student.call("GET", route+"image?id="+img, "", nil, 404, nil)
	if len(deck.Groups) != 1 {
		t.Fatal("lost groups after restart")
	}
}

func TestCopilotImageFallbackAndVision(t *testing.T) {
	dir := t.TempDir()
	a := testServer(t, dir)
	pages, images, e := func() ([]pilotPage, map[string]pilotAsset, error) {
		b, err := os.ReadFile("web/copilot-demo.pptx")
		if err != nil {
			return nil, nil, err
		}
		return extractPPTX(b, "slides.pptx")
	}()
	if e != nil {
		t.Fatal(e)
	}
	p := pages[0]
	var el pilotElement
	for _, v := range p.Elements {
		if v.Kind == "image" {
			el = v
		}
	}
	if e = os.WriteFile(dir+"/"+el.Image, images[el.Image].Data, 0600); e != nil {
		t.Fatal(e)
	}
	q := pilotQuestion{Question: "箭头在哪里？"}
	r := &room{Draft: sampleDraft()}
	t.Setenv("AI_VISION_MODEL", "")
	basic := a.s.explainPilot(context.Background(), r, pilotDeck{Pages: pages}, p, el, q, dir)
	if basic.Mode != "课件图注" || basic.Source != el.Text {
		t.Fatal("picture fallback fabricated an interpretation")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var msg struct{ Messages []struct{ Content any } }
		json.NewDecoder(r.Body).Decode(&msg)
		user := msg.Messages[1].Content.([]any)
		if !strings.HasPrefix(user[1].(map[string]any)["image_url"].(map[string]any)["url"].(string), "data:image/png;base64,") {
			t.Error("missing image input")
		}
		json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": "图中各层依次堆叠，顶部标出 total(0)。"}}}})
	}))
	defer server.Close()
	t.Setenv("AI_BASE_URL", server.URL)
	t.Setenv("AI_API_KEY", "fake")
	t.Setenv("AI_VISION_MODEL", "vision-fixture")
	response := a.s.explainPilot(context.Background(), r, pilotDeck{Pages: pages}, p, el, q, dir)
	if response.Mode != "AI 图像解释" || !strings.Contains(response.Source, "slides.pptx") {
		t.Fatalf("image %v", response)
	}
}
