package main

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func decodeResult[T any](t *testing.T, reply *httptest.ResponseRecorder) T {
	t.Helper()
	var result T
	if err := json.Unmarshal(reply.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestTeacherWorkspaceAndLessonAuthorization(t *testing.T) {
	t.Setenv("EDUMIND_AUTH_DIR", t.TempDir())
	t.Setenv("EDUMIND_LOCAL_DEMO", "1")
	t.Setenv("EDUMIND_ORIGIN", "")
	t.Setenv("EDUMIND_TEACHER_CODE", "class-test-code")
	server, err := newServer()
	if err != nil {
		t.Fatal(err)
	}
	login := func(role string) *http.Cookie {
		reply := call(server, "POST", "/api/auth/login", `{"username":"`+role+`","password":"123456"}`, nil)
		requireStatus(t, reply, 200)
		return reply.Result().Cookies()[0]
	}
	teacher, student := login("teacher"), login("student")
	otherStudent := call(server, "POST", "/api/auth/register", `{"username":"outside","password":"test-student","role":"student"}`, nil)
	requireStatus(t, otherStudent, 200)
	other := otherStudent.Result().Cookies()[0]
	otherTeacher := call(server, "POST", "/api/auth/register", `{"username":"other-instructor","password":"test-teacher","role":"teacher","inviteCode":"class-test-code"}`, nil)
	requireStatus(t, otherTeacher, 200)
	another := otherTeacher.Result().Cookies()[0]
	const base = "/api/teaching/"
	requireStatus(t, call(server, "GET", base+"workspace", "", nil), 401)
	requireStatus(t, call(server, "GET", base+"workspace", "", student), 403)
	requireStatus(t, call(server, "GET", "/api/pages/courseware", "", teacher), 200)
	requireStatus(t, call(server, "GET", "/api/pages/courseware", "", student), 403)
	created := call(server, "POST", base+"classes", `{"name":"数据结构一班","students":["student"," STUDENT "]}`, teacher)
	requireStatus(t, created, 200)
	class := decodeResult[teachingClass](t, created)
	if len(class.Roster) != 1 {
		t.Fatal("student roster should be deduplicated")
	}
	created = call(server, "POST", base+"courses", `{"name":"数据结构","classId":"`+class.ID+`"}`, teacher)
	requireStatus(t, created, 200)
	course := decodeResult[teachingCourse](t, created)
	requireStatus(t, call(server, "DELETE", base+"classes/"+class.ID, "", teacher), 409)
	requireStatus(t, call(server, "DELETE", base+"courses/"+course.ID, "", another), 404)

	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, err := form.CreateFormFile("file", "stacks.md")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.WriteString(part, "# 调用栈\n调用时入栈，返回时出栈。"); err != nil {
		t.Fatal(err)
	}
	if err := form.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "http://localhost:5173"+base+"courses/"+course.ID+"/decks", &body)
	req.AddCookie(teacher)
	req.Header.Set("Content-Type", form.FormDataContentType())
	reply := httptest.NewRecorder()
	server.serveAPI(reply, req)
	requireStatus(t, reply, 200)
	deck := decodeResult[courseDeck](t, reply)
	if len(deck.Pages) != 1 || len(deck.Topics) != 1 || deck.Topics[0].Title != "调用栈" {
		t.Fatalf("unexpected extracted courseware: %#v", deck)
	}
	fileURL := base + "decks/" + deck.ID + "/file"
	requireStatus(t, call(server, "GET", fileURL, "", student), 404)
	requireStatus(t, call(server, "GET", fileURL, "", another), 404)
	created = call(server, "POST", base+"live", `{"deckId":"`+deck.ID+`"}`, teacher)
	requireStatus(t, created, 200)
	live := decodeResult[liveView](t, created)
	requireStatus(t, call(server, "GET", base+"live/"+course.ID, "", student), 200)
	requireStatus(t, call(server, "GET", base+"live/"+course.ID, "", other), 404)
	requireStatus(t, call(server, "GET", fileURL, "", other), 404)
	requireStatus(t, call(server, "GET", fileURL, "", student), 200)
	requireStatus(t, call(server, "DELETE", base+"decks/"+deck.ID, "", teacher), 409)
	requireStatus(t, call(server, "PUT", base+"live/"+course.ID, `{"id":"`+live.ID+`","page":1}`, student), 403)
	reopened, err := newServer()
	if err != nil {
		t.Fatal(err)
	}
	requireStatus(t, call(reopened, "GET", base+"live/"+course.ID, "", student), 200)
	requireStatus(t, call(reopened, "DELETE", base+"live/"+course.ID+"?id="+live.ID, "", teacher), 200)
	requireStatus(t, call(reopened, "GET", fileURL, "", student), 404)
}

func TestModelProfilesKeepCredentialsPrivate(t *testing.T) {
	t.Setenv("EDUMIND_AUTH_DIR", t.TempDir())
	t.Setenv("EDUMIND_LOCAL_DEMO", "1")
	t.Setenv("EDUMIND_ORIGIN", "")
	server, err := newServer()
	if err != nil {
		t.Fatal(err)
	}
	login := call(server, "POST", "/api/auth/login", `{"username":"teacher","password":"123456"}`, nil)
	requireStatus(t, login, 200)
	teacher := login.Result().Cookies()[0]
	const sample = "sample-private-credential"
	created := call(server, "POST", "/api/models", `{"name":"我的模型","baseUrl":"api.openai.com","model":"demo","apiKey":"`+sample+`"}`, teacher)
	requireStatus(t, created, 200)
	if strings.Contains(created.Body.String(), sample) {
		t.Fatal("model response contains a credential")
	}
	first := decodeResult[struct{ Active string }](t, created).Active
	reuse := `{"name":"另一模型","model":"second","credentialId":"` + first + `","baseUrl":"`
	requireStatus(t, call(server, "POST", "/api/models", reuse+`api.deepseek.com"}`, teacher), 400)
	created = call(server, "POST", "/api/models", reuse+`api.openai.com"}`, teacher)
	requireStatus(t, created, 200)
	second := decodeResult[struct{ Active string }](t, created).Active
	if first == second || second == "" || strings.Contains(created.Body.String(), sample) {
		t.Fatal("model duplication did not safely activate a new profile")
	}
	requireStatus(t, call(server, "POST", "/api/models/activate", `{"id":"`+first+`"}`, teacher), 200)
	requireStatus(t, call(server, "POST", "/api/models/remove", `{"id":"`+second+`"}`, teacher), 200)
}
