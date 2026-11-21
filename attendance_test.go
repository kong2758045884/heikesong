package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func attendanceImageFixture(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 120, 100))
	img.Set(4, 3, color.White)
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, nil); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestAttendanceRolesConsentExpiryAndReview(t *testing.T) {
	t.Setenv("ATTENDANCE_VISION_API_KEY", "")
	dir := t.TempDir()
	s := testServer(t, dir).s
	const teacher = "lecturer"
	rm, err := s.store.createForCourse(sampleDraft(), true, teacher, "demo-course")
	if err != nil {
		t.Fatal(err)
	}
	setPhase := func(phase string) {
		t.Helper()
		if _, err := s.store.update(rm.Code, func(r *room) (bool, error) { r.Phase = phase; return true, nil }); err != nil {
			t.Fatal(err)
		}
	}
	setPhase("lecture")
	p := s.store.platform
	keys := map[string]string{}
	for i, id := range []string{teacher, "other-teacher", "student-a", "student-b", "student-c"} {
		role := "student"
		if i < 2 {
			role = "teacher"
		}
		key := strings.Repeat(string(rune('a'+i)), 64)
		keys[id] = key
		p.data.Accounts[id] = accountRecord{account: account{ID: id, DisplayName: "演示 " + id, Role: role}}
		p.data.Sessions[opaqueHash(key)] = loginSession{id, time.Now().Add(time.Hour).Unix()}
		if role == "student" {
			_, err = s.store.update(rm.Code, func(r *room) (bool, error) { return r.join(memberKey(r.Code, id)) })
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	call := func(user, path string, data any, want int) ([]byte, map[string]any) {
		t.Helper()
		b, _ := json.Marshal(data)
		method := "GET"
		if data != nil {
			method = "POST"
		}
		req := httptest.NewRequest(method, "http://localhost/api/rooms/"+rm.Code+"/attendance"+path, bytes.NewReader(b))
		if user != "" {
			req.AddCookie(&http.Cookie{Name: authCookie, Value: keys[user]})
		}
		req.Header.Set("Authorization", "Bearer "+rm.TeacherToken)
		w := httptest.NewRecorder()
		s.ServeHTTP(w, req)
		if w.Code != want {
			t.Fatalf("%s %s %s: %d != %d %s", user, method, path, w.Code, want, w.Body.String())
		}
		var out map[string]any
		if !strings.HasPrefix(path, "/photo") {
			_ = json.Unmarshal(w.Body.Bytes(), &out)
		}
		return w.Body.Bytes(), out
	}
	call("", "", nil, 401)
	call("other-teacher", "", nil, 403)
	call("student-a", "/open", map[string]int{"minutes": 2}, 403)
	_, view := call(teacher, "/open", map[string]int{"minutes": 2}, 200)
	round := view["round"].(string)
	code := view["challenge"].(string)
	_, v := call("student-b", "", nil, 200)
	if _, ok := v["challenge"]; ok {
		t.Fatal("student received onsite code")
	}
	pay := map[string]any{"round": round, "method": "photo", "challenge": code, "image": base64.StdEncoding.EncodeToString(attendanceImageFixture(t))}
	call("student-a", "/submit", pay, 400)
	pay["consent"] = true
	pay["challenge"] = "bogus"
	call("student-a", "/submit", pay, 400)
	pay["challenge"] = code
	_, v = call("student-a", "/submit", pay, 200)
	if len(v["records"].([]any)) != 1 {
		t.Fatal("request not recorded")
	}
	row := v["records"].([]any)[0].(map[string]any)
	id := row["id"].(string)
	if row["status"] != "pending" {
		t.Fatal("premature attendance decision")
	}
	_, v = call("student-a", "/submit", pay, 200)
	if len(v["records"].([]any)) != 1 {
		t.Fatal("duplicate entry")
	}
	_, v = call("student-b", "", nil, 200)
	if len(v["records"].([]any)) != 0 {
		t.Fatal("classmate could see private record")
	}
	call("student-b", "/photo?id="+id, nil, 403)
	call("other-teacher", "/photo?id="+id, nil, 403)
	// Publishing a quiz in this lecture must preserve the teacher, student, round and photo.
	setPhase("open")
	_, afterPublish := call("student-a", "", nil, 200)
	if afterPublish["active"] != true || afterPublish["round"] != round || len(afterPublish["records"].([]any)) != 1 {
		t.Fatal("attendance lost when a lecture published its first quiz")
	}
	call(teacher, "/photo?id="+id, nil, 200)
	call(teacher, "/vision", map[string]any{"id": id}, 409)
	_, v = call("student-b", "/submit", map[string]any{"round": round, "method": "manual"}, 200)
	mid := v["records"].([]any)[0].(map[string]any)["id"]
	call(teacher, "/review", map[string]any{"id": mid, "decision": "rejected", "confirmed": true}, 400)
	call(teacher, "/review", map[string]any{"id": mid, "decision": "rejected", "confirmed": true, "note": "现场未能核实，到课后请联系教师。"}, 200)
	call(teacher, "/review", map[string]any{"id": id, "decision": "approved"}, 400)
	call(teacher, "/review", map[string]any{"id": id, "decision": "approved", "confirmed": true}, 200)
	call(teacher, "/photo?id="+id, nil, 404)
	_, v = call("student-a", "", nil, 200)
	if v["records"].([]any)[0].(map[string]any)["status"] != "approved" {
		t.Fatal("student status missing")
	}
	_, v = call("student-c", "/submit", pay, 200)
	expireID := v["records"].([]any)[0].(map[string]any)["id"].(string)
	l, e := loadAttendance(attendPath(dir, rm.Code))
	if e != nil {
		t.Fatal(e)
	}
	_, rec := l.lookup(expireID)
	rec.Expires = time.Now().Add(-time.Minute)
	l.latest().Deadline = rec.Expires
	if err = persistAttendance(attendPath(dir, rm.Code), l); err != nil {
		t.Fatal(err)
	}
	call(teacher, "/photo?id="+expireID, nil, 404)
	_, v = call(teacher, "", nil, 200)
	if v["active"] != false {
		t.Fatal("expired round is open")
	}
	call(teacher, "/close", map[string]any{"round": round}, 200)
	next, err := os.ReadDir(filepath.Join(attendPath(dir, rm.Code), "photos"))
	if err != nil || len(next) != 1 {
		t.Fatal("review did not purge image", err)
	}
	sweepAttendance(dir, time.Now().Add(11*time.Minute))
	next, err = os.ReadDir(filepath.Join(attendPath(dir, rm.Code), "photos"))
	if err != nil || len(next) != 0 {
		t.Fatal("retention failed", err)
	}
}
func TestAttendanceVisionEvidence(t *testing.T) {
	round := &attendanceRound{Code: "132042", Gesture: attendanceGestures[1]}
	for _, test := range []struct {
		name       string
		confidence float64
		code       string
		ok         bool
	}{{"strong", .98, "132042", true}, {"low", .6, "132042", false}, {"wrong code", .99, "132041", false}} {
		t.Run(test.name, func(t *testing.T) {
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var payload struct {
					Messages []struct{ Content []map[string]any }
				}
				if json.NewDecoder(r.Body).Decode(&payload) != nil || len(payload.Messages) != 1 || len(payload.Messages[0].Content) != 2 {
					t.Error("missing real multimodal image")
				}
				user := payload.Messages[0].Content
				if !strings.HasPrefix(user[1]["image_url"].(map[string]any)["url"].(string), "data:image/jpeg;base64,") || strings.Contains(user[0]["text"].(string), round.Code) {
					t.Error("missing photo or disclosed expected code")
				}
				result, _ := json.Marshal(map[string]any{"foregroundPerson": true, "distinctPersonAtBoard": true, "board": true, "gesture": round.Gesture, "visibleCode": test.code, "confidence": test.confidence})
				_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": string(result)}}}})
			}))
			defer up.Close()
			out, err := checkAttendanceScene(context.Background(), attendanceVisionConfig{up.URL, "test", "vision", "test"}, attendanceImageFixture(t), round)
			if err != nil || strings.Contains(out, "至少 0.90") != test.ok {
				t.Fatalf("evidence gate %s %v", out, err)
			}
		})
	}
}
