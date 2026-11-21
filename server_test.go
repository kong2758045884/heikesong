package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

type testAPI struct {
	t *testing.T
	s *server
}

func testServer(t *testing.T, dir string) testAPI {
	t.Helper()
	s, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	return testAPI{t, &server{store: s, lanHost: "192.168.1.3", generations: make(chan struct{}, 1)}}
}

func (a testAPI) call(method, path, token string, body any, want int, out any) {
	a.t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		a.t.Fatal(err)
	}
	r := httptest.NewRequest(method, "http://localhost:8787"+path, bytes.NewReader(b))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	a.s.ServeHTTP(w, r)
	if w.Code != want {
		a.t.Fatalf("%s %s: got %d, want %d: %s", method, path, w.Code, want, w.Body.String())
	}
	if out != nil {
		if err = json.Unmarshal(w.Body.Bytes(), out); err != nil {
			a.t.Fatal(err)
		}
	}
}

func TestClassroomHTTPLifecycleAndRestart(t *testing.T) {
	dir := t.TempDir()
	api := testServer(t, dir)
	d := sampleDraft()
	var created struct{ Code, TeacherToken, JoinURL string }
	api.call("POST", "/api/rooms", "", map[string]any{"draft": d, "feedback": true}, 200, &created)
	if !codePattern.MatchString(created.Code) || created.JoinURL != "http://192.168.1.3:8787/join/"+created.Code {
		t.Fatalf("invalid new room: %+v", created)
	}
	prefix := "/api/rooms/" + created.Code + "/"
	var state studentState
	var stats struct {
		Joined, Submitted, Pending, VariantRight, VariantSubmitted, VariantBaselineRight int
		VariantCounts                                                                    []int
		Phase                                                                            string
		VariantIndex                                                                     *int
		Questions                                                                        []struct {
			Counts []int
			Right  int
		}
	}
	ids := []string{"session-a-1234567890", "session-b-1234567890", "session-c-1234567890"}
	for _, id := range ids {
		api.call("POST", prefix+"join", "", map[string]string{"sessionId": id}, 200, &state)
	}
	api.call("POST", prefix+"join", "", map[string]string{"sessionId": ids[0]}, 200, &state)
	api.call("GET", prefix+"stats", ids[0], nil, 403, nil)
	api.call("GET", prefix+"state", "unjoined-anonymous-session", nil, 401, nil)
	var public map[string]any
	api.call("GET", prefix+"state", ids[0], nil, 200, &public)
	for _, v := range public["questions"].([]any) {
		q := v.(map[string]any)
		if _, ok := q["correct"]; ok || len(q) != 3 {
			t.Fatalf("question leaks answer metadata: %#v", q)
		}
	}
	if public["feedback"] != nil || public["variant"] != nil {
		t.Fatal("feedback before submission")
	}
	wrong := (d.Questions[1].Correct + 1) % 4
	first := map[string][]int{"answers": {d.Questions[0].Correct, wrong, d.Questions[2].Correct}}
	api.call("POST", prefix+"answers", ids[0], map[string]any{"answers": []any{0, nil, 0}}, 400, nil)
	api.call("POST", prefix+"answers", ids[0], first, 200, &state)
	if !state.Submitted || state.Feedback == nil || state.Feedback.VariantCorrect != nil {
		t.Fatal("wrong first feedback")
	}
	api.call("POST", prefix+"answers", ids[0], first, 200, nil)
	api.call("POST", prefix+"answers", ids[0], map[string][]int{"answers": {(d.Questions[0].Correct + 1) % 4, wrong, d.Questions[2].Correct}}, 409, nil)
	api.call("POST", prefix+"answers", ids[1], first, 200, nil)
	api.call("GET", prefix+"stats", created.TeacherToken, nil, 200, &stats)
	if stats.Joined != 3 || stats.Submitted != 2 || stats.Pending != 1 || stats.Questions[1].Counts[wrong] != 2 || stats.Questions[1].Right != 0 {
		t.Fatalf("incorrect stats: %+v", stats)
	}
	q := d.Variants[1]
	q.Prompt += "（教师改编）"
	push := map[string]any{"index": 1, "question": q}
	api.call("POST", prefix+"retry", ids[0], map[string]int{"answer": q.Correct}, 409, nil)
	api.call("POST", prefix+"variant", created.TeacherToken, push, 200, nil)
	api.call("POST", prefix+"variant", created.TeacherToken, push, 200, nil)
	api.call("GET", prefix+"state", ids[0], nil, 200, &state)
	if state.Variant == nil || state.Variant.Prompt != q.Prompt {
		t.Fatal("missing edited variant")
	}
	api.call("POST", prefix+"retry", ids[2], map[string]int{"answer": q.Correct}, 409, nil)
	api.call("POST", prefix+"answers", ids[2], first, 200, nil)
	api.call("POST", prefix+"retry", ids[0], map[string]int{"answer": q.Correct}, 200, &state)
	if !state.Retried || state.Feedback.VariantCorrect == nil || *state.Feedback.VariantCorrect != q.Correct {
		t.Fatal("missing retry feedback")
	}
	api.call("POST", prefix+"retry", ids[0], map[string]int{"answer": q.Correct}, 200, nil)
	api.call("POST", prefix+"retry", ids[0], map[string]int{"answer": (q.Correct + 1) % 4}, 409, nil)
	api = testServer(t, dir)
	api.call("GET", prefix+"stats", created.TeacherToken, nil, 200, &stats)
	if stats.VariantBaselineRight != 0 || stats.VariantRight != 1 || stats.VariantSubmitted != 1 || stats.VariantCounts[q.Correct] != 1 || stats.Pending != 0 || stats.Phase != "variant" || stats.VariantIndex == nil || *stats.VariantIndex != 1 {
		t.Fatalf("loss on restart: %+v", stats)
	}
	api.call("POST", prefix+"close", created.TeacherToken, nil, 200, nil)
	api.call("POST", prefix+"retry", ids[1], map[string]int{"answer": 0}, 409, nil)
	api.call("POST", prefix+"join", "", map[string]string{"sessionId": "late-arrival-session"}, 409, nil)
	api.call("GET", prefix+"state", ids[1], nil, 200, &state)
	if state.Phase != "closed" {
		t.Fatalf("not closed")
	}
}

func TestConcurrentJoinSubmitAndPrivateFeedback(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir).s.store
	r, err := s.create(sampleDraft(), false)
	if err != nil {
		t.Fatal(err)
	}
	const n = 15
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		id := fmt.Sprintf("anonymous-session-%03d", i)
		for duplicate := 0; duplicate < 2; duplicate++ {
			wg.Add(1)
			go func(id string) {
				defer wg.Done()
				if _, err := s.update(r.Code, func(v *room) (bool, error) { return v.join(id) }); err != nil {
					t.Error(err)
					return
				}
				if _, err := s.update(r.Code, func(v *room) (bool, error) { return v.submit(id, []int{0, 1, 2}) }); err != nil {
					t.Error(err)
				}
			}(id)
		}
	}
	wg.Wait()
	fresh, err := s.get(r.Code)
	if err != nil {
		t.Fatal(err)
	}
	o := stats(fresh, "")
	if o.Joined != n || o.Submitted != n || o.Pending != 0 || o.Questions[1].Counts[1] != n {
		t.Fatalf("concurrent stats %+v", o)
	}
	reply, err := state(fresh, "anonymous-session-000")
	if err != nil || reply.Feedback != nil {
		t.Fatal("feedback setting ignored")
	}
}

func TestFailedSaveDoesNotPublishPartialRoom(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir).s.store
	r, err := s.create(sampleDraft(), true)
	if err != nil {
		t.Fatal(err)
	}
	s.dir = filepath.Join(dir, "not-a-directory")
	if err = os.WriteFile(s.dir, []byte{}, 0600); err != nil {
		t.Fatal(err)
	}
	_, err = s.update(r.Code, func(v *room) (bool, error) { return v.join("anonymous-student-fail") })
	if err == nil {
		t.Fatal("expected failed write")
	}
	fresh, _ := s.get(r.Code)
	if len(fresh.Students) != 0 {
		t.Fatal("failed write changed in-memory stats")
	}
}

func TestExplicitPublicBaseAndValidation(t *testing.T) {
	a := testServer(t, t.TempDir())
	a.s.publicBase = "https://classroom.example.edu"
	d := sampleDraft()
	var created struct{ Code, JoinURL string }
	a.call("POST", "/api/rooms", "", map[string]any{"draft": d}, 200, &created)
	if created.JoinURL != a.s.publicBase+"/join/"+created.Code {
		t.Fatal("wrong public link")
	}
	d.Questions[0].Options[2] = d.Questions[0].Options[1]
	a.call("POST", "/api/rooms", "", map[string]any{"draft": d}, 400, nil)
}

func TestPublicDemoBounds(t *testing.T) {
	store := testServer(t, t.TempDir()).s.store
	r, err := store.create(sampleDraft(), true)
	if err != nil {
		t.Fatal(err)
	}
	for len(store.rooms) < maxRooms {
		store.rooms[fmt.Sprint(len(store.rooms))] = r
	}
	if _, err = store.create(sampleDraft(), true); err == nil {
		t.Fatal("room cap ignored")
	}
	for i := 0; i < maxParticipants; i++ {
		if _, err := r.join(fmt.Sprintf("anonymous-session-%03d", i)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = r.join("one-too-many-participants"); err == nil {
		t.Fatal("participant cap ignored")
	}
	if changed, err := r.join("anonymous-session-000"); err != nil || changed {
		t.Fatal("existing student blocked at cap")
	}
	now := time.Unix(0, 0)
	var budget dailyBudget
	for i := 0; i < 60; i++ {
		if !budget.take(now) {
			t.Fatal("generation budget exhausted early")
		}
	}
	if budget.take(now) || !budget.take(now.Add(24*time.Hour)) {
		t.Fatal("generation budget window")
	}
}

func TestEmbeddedTeacherStudentAndAssets(t *testing.T) {
	root, err := fs.Sub(embeddedWeb, "web")
	if err != nil {
		t.Fatal(err)
	}
	s := &server{files: http.FileServer(http.FS(root))}
	for _, path := range []string{"/", "/join/111111", "/student.js", "/assets/qr.js"} {
		w := httptest.NewRecorder()
		s.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 || w.Body.Len() == 0 {
			t.Fatalf("embedded %s returned %d", path, w.Code)
		}
	}
}
