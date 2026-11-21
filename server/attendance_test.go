package main

import (
	"net/http"
	"testing"
)

func TestAttendanceIsScopedToPublishedClassRoster(t *testing.T) {
	t.Setenv("EDUMIND_AUTH_DIR", t.TempDir())
	t.Setenv("EDUMIND_LOCAL_DEMO", "1")
	t.Setenv("EDUMIND_ORIGIN", "")
	t.Setenv("EDUMIND_TEACHER_CODE", "teacher-test-code")
	server, err := newServer()
	if err != nil {
		t.Fatal(err)
	}
	login := func(username string) *http.Cookie {
		reply := call(server, "POST", "/api/auth/login", `{"username":"`+username+`","password":"123456"}`, nil)
		requireStatus(t, reply, 200)
		return reply.Result().Cookies()[0]
	}
	teacher, student := login("teacher"), login("student")
	registered := call(server, "POST", "/api/auth/register", `{"username":"outside","password":"outside-pass","role":"student"}`, nil)
	requireStatus(t, registered, 200)
	outside := registered.Result().Cookies()[0]
	registered = call(server, "POST", "/api/auth/register", `{"username":"other-teacher","password":"instructor-pass","role":"teacher","inviteCode":"teacher-test-code"}`, nil)
	requireStatus(t, registered, 200)
	otherTeacher := registered.Result().Cookies()[0]

	classURL := "/api/teaching/classes"
	class := call(server, "POST", classURL, `{"name":"数据结构一班","students":["student"]}`, teacher)
	requireStatus(t, class, 200)
	classID := decodeResult[teachingClass](t, class).ID
	const base = "/api/attendance/"
	const rules = `"title":"课前签到","gesture":"v","minutes":10,"allowCode":true`
	requireStatus(t, call(server, "POST", base+"rounds", "{"+rules+"}", teacher), 400)
	body := `{"classId":"` + classID + `",` + rules + "}"
	requireStatus(t, call(server, "POST", base+"rounds", body, otherTeacher), 404)

	created := call(server, "POST", base+"rounds", body, teacher)
	requireStatus(t, created, 200)
	round := decodeResult[attendanceRound](t, created)
	if round.ClassID != classID || round.ClassName != "数据结构一班" || len(round.Roster) != 1 || round.Code == "" {
		t.Fatalf("unexpected teacher view: %#v", round)
	}
	visible := decodeResult[[]attendanceRound](t, call(server, "GET", base+"rounds", "", student))
	if len(visible) != 1 || visible[0].ID != round.ID || visible[0].Joined || visible[0].Code != "" || len(visible[0].Roster) != 0 {
		t.Fatalf("student should see only their eligible round and no code or roster: %#v", visible)
	}
	if list := decodeResult[[]attendanceRound](t, call(server, "GET", base+"rounds", "", outside)); len(list) != 0 {
		t.Fatalf("student outside the class received a round: %#v", list)
	}
	join := `{"code":"` + round.Code + `"}`
	submit := base + round.ID + "/submit"
	requireStatus(t, call(server, "POST", base+"join", join, outside), 404)
	requireStatus(t, call(server, "POST", submit, `{"method":"code"}`, outside), 404)
	requireStatus(t, call(server, "POST", submit, `{"method":"code"}`, student), 404)

	requireStatus(t, call(server, "PUT", classURL+"/"+classID, `{"name":"数据结构一班","students":["student","outside"]}`, teacher), 200)
	requireStatus(t, call(server, "POST", base+"join", join, outside), 404)
	joined := call(server, "POST", base+"join", join, student)
	requireStatus(t, joined, 200)
	if !decodeResult[attendanceRound](t, joined).Joined {
		t.Fatal("student should be joined after entering the class code")
	}
	reopened, err := newServer()
	if err != nil {
		t.Fatal(err)
	}
	submitted := call(reopened, "POST", submit, `{"method":"code"}`, student)
	requireStatus(t, submitted, 200)
	receipt := decodeResult[attendanceRound](t, submitted)
	if len(receipt.Entries) != 1 || receipt.Entries[0].Username != "student" || receipt.Entries[0].Status != "verified" {
		t.Fatalf("expected a confirmed student receipt: %#v", receipt)
	}
	requireStatus(t, call(reopened, "POST", base+round.ID+"/close", "{}", teacher), 200)
	requireStatus(t, call(reopened, "POST", base+"join", join, student), 404)
}
