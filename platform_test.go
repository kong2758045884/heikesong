package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type platformClient struct {
	t      *testing.T
	s      *server
	cookie *http.Cookie
}

func (c *platformClient) request(method, path, token string, body any) (int, []byte, []*http.Cookie) {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(method, "http://localhost"+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if c.cookie != nil {
		req.AddCookie(c.cookie)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	c.s.ServeHTTP(w, req)
	return w.Code, w.Body.Bytes(), w.Result().Cookies()
}
func (c *platformClient) call(method, path, token string, body any, want int, out any) {
	c.t.Helper()
	code, data, cookies := c.request(method, path, token, body)
	if code != want {
		c.t.Fatalf("%s -> %d (want %d), %s", path, code, want, data)
	}
	if len(cookies) > 0 {
		c.cookie = cookies[0]
	}
	if out != nil {
		if err := json.Unmarshal(data, out); err != nil {
			c.t.Fatal(err)
		}
	}
}
func (c *platformClient) register(name, role string) {
	c.t.Helper()
	var out struct{ User account }
	c.call("POST", "/api/auth/register", "", map[string]string{"username": name, "password": "valid-password", "role": role}, 200, &out)
	if out.User.Role != role || c.cookie == nil || !c.cookie.HttpOnly || c.cookie.SameSite != http.SameSiteLaxMode {
		c.t.Fatal("account or cookie invalid")
	}
}
func TestPlatformOwnershipLearningAndRecovery(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir).s
	guest := platformClient{t: t, s: s}
	teacher, other, student, outsider := guest, guest, guest, guest
	teacher.register("教师甲", "teacher")
	other.register("教师乙", "teacher")
	student.register("学生甲", "student")
	outsider.register("学生乙", "student")
	fresh := guest
	var mismatch struct{ Error string }
	fresh.call("POST", "/api/auth/login", "", map[string]string{"username": "学生甲", "password": "valid-password", "role": "teacher"}, 403, &mismatch)
	if !strings.Contains(mismatch.Error, "该账号为学生") {
		t.Fatal(mismatch.Error)
	}
	fresh.call("POST", "/api/auth/login", "", map[string]string{"username": "学生甲", "password": "valid-password"}, 200, nil)
	var me struct{ User *account }
	fresh.call("GET", "/api/auth/me", "", nil, 200, &me)
	if me.User.Role != "student" {
		t.Fatal("role changed by login payload")
	}
	var created struct{ Course courseBrief }
	teacher.call("POST", "/api/courses", "", map[string]string{"name": "Python", "className": "大一 A"}, 200, &created)
	cid := created.Course.ID
	var foreign struct{ Course courseBrief }
	other.call("POST", "/api/courses", "", map[string]string{"name": "计算机基础", "className": "大一 B"}, 200, &foreign)
	d := sampleDraft()
	create := map[string]any{"draft": d, "feedback": true, "courseId": cid}
	guest.call("POST", "/api/rooms", "", create, 401, nil)
	student.call("POST", "/api/rooms", "", create, 403, nil)
	other.call("POST", "/api/rooms", "", create, 403, nil)
	student.call("GET", "/api/sample", "", nil, 403, nil)
	teacher.call("GET", "/api/sample", "", nil, 200, nil)
	student.call("POST", "/api/generate", "", nil, 403, nil)
	var rm struct{ Code, TeacherToken string }
	teacher.call("POST", "/api/rooms", "", create, 200, &rm)
	path := "/api/rooms/" + rm.Code + "/"
	teacher.call("GET", path+"stats", "", nil, 403, nil)
	teacher.call("GET", path+"stats", rm.TeacherToken, nil, 200, nil)
	other.call("GET", path+"stats", rm.TeacherToken, nil, 403, nil)
	student.call("GET", path+"stats", rm.TeacherToken, nil, 403, nil)
	guest.call("GET", path+"stats", rm.TeacherToken, nil, 401, nil)
	guest.call("POST", path+"join", "", map[string]string{"sessionId": "guest-ignored-sessionid"}, 401, nil)
	teacher.call("POST", path+"join", "", map[string]string{}, 403, nil)
	var courseList struct{ Courses []courseBrief }
	outsider.call("GET", "/api/courses", "", nil, 200, &courseList)
	if len(courseList.Courses) != 0 {
		t.Fatal("outsider saw courses")
	}
	var enrolled struct{ Course courseBrief }
	student.call("POST", "/api/courses/join", "", map[string]string{"inviteCode": created.Course.InviteCode}, 200, &enrolled)
	if enrolled.Course.InviteCode != "" || enrolled.Course.Rooms[0].TeacherToken != "" {
		t.Fatal("secret leaked to student")
	}
	student.call("POST", path+"join", "", map[string]any{}, 200, nil)
	fresh.call("POST", path+"join", "", map[string]any{"sessionId": "arbitrary-other-browser"}, 200, nil)
	first := []int{(d.Questions[0].Correct + 1) % 4, d.Questions[1].Correct, d.Questions[2].Correct}
	var wg sync.WaitGroup
	for _, client := range []*platformClient{&student, &fresh} {
		wg.Add(1)
		go func(c *platformClient) {
			defer wg.Done()
			code, _, _ := c.request("POST", path+"answers", "", map[string]any{"answers": first})
			if code != 200 {
				t.Errorf("submit %d", code)
			}
		}(client)
	}
	wg.Wait()
	var stats roomStats
	teacher.call("GET", path+"stats", rm.TeacherToken, nil, 200, &stats)
	if stats.Joined != 1 || stats.Submitted != 1 {
		t.Fatal("duplicate account")
	}
	var records struct {
		Summary  learningSummary
		Mistakes []struct {
			QuestionIndex         int
			Reviewed              bool
			Source, Misconception string
		}
		History []map[string]any
		Levels  []learningLevel
	}
	student.call("GET", "/api/learning", "", nil, 200, &records)
	if records.Summary.Correct != 2 || records.Summary.Accuracy != 67 || records.Summary.Joined != 1 || len(records.Mistakes) != 1 || records.Mistakes[0].QuestionIndex != 0 || records.Mistakes[0].Source != d.Source || records.Mistakes[0].Misconception == "" {
		t.Fatalf("learning mismatch %#v", records)
	}
	mark := map[string]any{"code": rm.Code, "questionIndex": 0, "isVariant": false, "done": true}
	t.Setenv("AI_API_KEY", "")
	outsider.call("POST", "/api/learning/diagnose", "", mark, 403, nil)
	var advice mistakeAdvice
	student.call("POST", "/api/learning/diagnose", "", mark, 200, &advice)
	if advice.Mode != "题目解析" || advice.NextStep != d.Questions[0].Explanation {
		t.Fatal("diagnosis fallback mismatch")
	}
	outsider.call("POST", "/api/learning/review", "", mark, 403, nil)
	student.call("POST", "/api/learning/review", "", mark, 200, nil)
	create["feedback"] = false
	var hidden struct{ Code string }
	teacher.call("POST", "/api/rooms", "", create, 200, &hidden)
	hid := "/api/rooms/" + hidden.Code + "/"
	student.call("POST", hid+"join", "", map[string]any{}, 200, nil)
	student.call("POST", hid+"answers", "", map[string]any{"answers": first}, 200, nil)
	student.call("POST", "/api/learning/diagnose", "", map[string]any{"code": hidden.Code, "questionIndex": 0, "isVariant": false}, 403, nil)
	restarted := testServer(t, dir).s
	fresh.s = restarted
	teacher.s = restarted
	fresh.call("GET", "/api/learning", "", nil, 200, &records)
	if records.Summary.Submitted != 2 || records.Summary.Scored != 3 || records.Summary.QuestionsAnswered != 6 || len(records.Mistakes) != 1 || !records.Mistakes[0].Reviewed || len(records.History) != 2 || records.History[0]["correct"] != nil {
		t.Fatalf("persisted learning or hidden feedback %#v", records)
	}
	fresh.call("GET", path+"state", "", nil, 200, nil)
	teacher.call("GET", path+"stats", rm.TeacherToken, nil, 200, nil)
	legacy, err := s.store.create(sampleDraft(), false)
	if err != nil {
		t.Fatal(err)
	}
	old := "/api/rooms/" + legacy.Code + "/stats"
	student.call("GET", old, legacy.TeacherToken, nil, 403, nil)
	guest.call("GET", old, legacy.TeacherToken, nil, 401, nil)
	teacher.s = s
	teacher.call("GET", old, legacy.TeacherToken, nil, 200, nil)
	prev := fresh.cookie
	fresh.call("POST", "/api/auth/logout", "", nil, 200, nil)
	fresh.cookie = prev
	fresh.call("GET", "/api/learning", "", nil, 401, nil)
	raw, _ := os.ReadFile(filepath.Join(dir, "platform.json"))
	if bytes.Contains(raw, []byte("valid-password")) || bytes.Contains(raw, []byte(teacher.cookie.Value)) {
		t.Fatal("secret stored without hashing")
	}
}
func TestCSRFAndPasswordHash(t *testing.T) {
	s := testServer(t, t.TempDir()).s
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "https://example.edu/api/auth/register", strings.NewReader("{}"))
	r.Header.Set("Origin", "https://foreign.example")
	s.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("foreign origin accepted")
	}
	// Generated independently with Python hashlib.pbkdf2_hmac.
	if got := derive("example-password", "73616c74"); got != "126269030666bf5026ebdef2c1d5e2e2a6533d397af0ccbb4857a568af614465" {
		t.Fatal("PBKDF2 vector failed")
	}
}

func TestMistakeAdviceUsesOnlyReviewedContext(t *testing.T) {
	t.Setenv("AI_API_KEY", "test")
	t.Setenv("AI_MODEL", "test-model")
	d := sampleDraft()
	q := d.Questions[1]
	selected := (q.Correct + 1) % 4
	server := testServer(t, t.TempDir()).s
	for _, tc := range []struct {
		body string
		want string
	}{
		{`{"possibleCause":"可能跳过了一层返回。","nextStep":"画出每次回退的栈帧并写下返回值。"}`, "AI 错因分析"},
		{"not-json", "题目解析"},
	} {
		provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var payload struct {
				Messages []struct{ Role, Content string }
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || len(payload.Messages) != 2 {
				t.Error("invalid upstream payload")
				return
			}
			var data map[string]string
			if err := json.Unmarshal([]byte(payload.Messages[1].Content), &data); err != nil || len(data) != 6 || data["selectedOption"] != q.Options[selected] || data["material"] != d.Material {
				t.Error("unexpected student information or missing context")
			}
			json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": tc.body}}}})
		}))
		t.Setenv("AI_BASE_URL", provider.URL)
		got := server.explainMistake(context.Background(), q, selected, d.Material)
		provider.Close()
		if got.Mode != tc.want {
			t.Fatal(got)
		}
	}
}

func TestLectureFirstPublishKeepsParticipantsAndTeachingResources(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir).s
	t1 := platformClient{t: t, s: s}
	stu := platformClient{t: t, s: s}
	t1.register("讲授教师", "teacher")
	stu.register("课程学生", "student")
	var c struct{ Course courseBrief }
	t1.call("POST", "/api/courses", "", map[string]any{"name": "Python 程序设计", "className": "实验一班"}, 200, &c)
	var created struct{ Code, TeacherToken, Phase string }
	roomInput := map[string]any{"courseId": c.Course.ID, "lecture": true}
	t1.call("POST", "/api/rooms", "", roomInput, 200, &created)
	if created.Phase != "lecture" {
		t.Fatal("new lecture starts with questions")
	}
	prefix := "/api/rooms/" + created.Code + "/"
	key := created.TeacherToken
	var st studentState
	stu.call("POST", prefix+"join", "", map[string]any{}, 200, &st)
	if st.Topic != c.Course.Name || st.Grade != c.Course.ClassName || st.Phase != "lecture" || st.Questions == nil || len(st.Questions) > 0 {
		t.Fatalf("lecture state %#v", st)
	}
	var rs roomStats
	t1.call("GET", prefix+"stats", key, nil, 200, &rs)
	if rs.Pending != 0 || rs.Joined != 1 || rs.Questions == nil || rs.Variants == nil {
		t.Fatal("lecture stats")
	}
	d := sampleDraft()
	stu.call("POST", prefix+"answers", "", map[string]any{"answers": []int{}}, 409, nil)
	t1.call("POST", prefix+"variant", key, map[string]any{"index": 0, "question": d.Variants[0]}, 409, nil)
	stu.call("POST", prefix+"retry", "", map[string]any{"answer": 0}, 409, nil)
	stu.call("GET", "/api/learning", "", nil, 200, nil)
	stu.call("GET", "/api/knowledge?courseId="+c.Course.ID, "", nil, 200, nil)
	t1.call("POST", prefix+"attendance/open", key, map[string]any{"minutes": 5}, 200, nil)
	t1.call("POST", prefix+"copilot/pages", key, map[string]any{"title": "讲授页 ABC", "elements": []map[string]string{{"kind": "code", "text": "total(0)"}}}, 200, nil)
	s = testServer(t, dir).s
	t1.s, stu.s = s, s
	t1.call("GET", prefix+"stats", key, nil, 200, &rs)
	if rs.Phase != "lecture" || rs.Joined != 1 {
		t.Fatal("lecture lost on restart")
	}
	payload := map[string]any{"draft": d, "feedback": true}
	stu.call("POST", prefix+"publish", key, payload, 403, nil)
	t1.call("POST", prefix+"publish", "", payload, 403, nil)
	t1.call("POST", prefix+"publish", key, payload, 200, &rs)
	t1.call("POST", prefix+"publish", key, payload, 200, &rs)
	stu.call("GET", prefix+"state", "", nil, 200, &st)
	if st.Phase != "open" || len(st.Questions) != 3 || rs.Joined != 1 || rs.Pending != 1 {
		t.Fatal("in-place publication failed")
	}
	code, b, _ := t1.request("GET", prefix+"copilot/state", key, nil)
	if code != 200 || !strings.Contains(string(b), "讲授页 ABC") {
		t.Fatal("deck lost")
	}
	code, b, _ = t1.request("GET", prefix+"attendance", key, nil)
	if code != 200 || !strings.Contains(string(b), "\"active\":true") {
		t.Fatalf("attendance not kept %s", b)
	}
	stu.call("POST", prefix+"answers", "", map[string]any{"answers": []int{1, 2, 3}}, 200, nil)
	d.Topic = "新知识点"
	t1.call("POST", prefix+"publish", key, map[string]any{"draft": d}, 409, nil)
	roomInput["topic"] = "只讲不测"
	t1.call("POST", "/api/rooms", "", roomInput, 200, &created)
	prefix = "/api/rooms/" + created.Code + "/"
	key = created.TeacherToken
	t1.call("POST", prefix+"close", key, nil, 200, nil)
	recovered := testServer(t, dir).s
	t1.s = recovered
	t1.call("GET", prefix+"stats", key, nil, 200, &rs)
	if rs.Phase != "closed" || len(rs.Questions) != 0 {
		t.Fatal("closed empty lecture not restored")
	}
	t1.call("POST", prefix+"publish", key, payload, 409, nil)
}
