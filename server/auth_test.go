package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func call(server *authServer, method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, "http://localhost:5173"+path, strings.NewReader(body))
	if method == http.MethodPost {
		request.Header.Set("Origin", "http://localhost:5173")
		request.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		request.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	server.serveAPI(response, request)
	return response
}

func requireStatus(t *testing.T, response *httptest.ResponseRecorder, want int) {
	t.Helper()
	if response.Code != want {
		t.Fatalf("status = %d, want %d: %s", response.Code, want, response.Body)
	}
}

func TestRoleAuthorizationAndPersistentSessions(t *testing.T) {
	t.Setenv("EDUMIND_LOCAL_DEMO", "1")
	t.Setenv("EDUMIND_AUTH_DIR", t.TempDir())
	t.Setenv("EDUMIND_ORIGIN", "")
	server, err := newServer()
	if err != nil {
		t.Fatal(err)
	}
	requireStatus(t, call(server, "GET", "/api/pages/dashboard", "", nil), 401)
	requireStatus(t, call(server, "POST", "/api/auth/login", `{"username":"teacher","password":"incorrect"}`, nil), 401)
	for _, role := range []string{"admin", "teacher", "student"} {
		login := call(server, "POST", "/api/auth/login", `{"username":"`+role+`","password":"123456","role":"admin"}`, nil)
		requireStatus(t, login, 200)
		if !strings.Contains(login.Body.String(), `"role":"`+role+`"`) {
			t.Fatal("a login request must not override the stored role")
		}
		cookies := login.Result().Cookies()
		if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
			t.Fatal("missing protected session cookie")
		}
		cookie := cookies[0]
		reopened, err := newServer()
		if err != nil {
			t.Fatal(err)
		}
		requireStatus(t, call(reopened, "GET", "/api/pages/dashboard", "", cookie), 200)
		want := 200
		if role == "admin" {
			want = 403
		}
		requireStatus(t, call(reopened, "GET", "/api/pages/knowledge-graph", "", cookie), want)
		requireStatus(t, call(reopened, "POST", "/api/auth/logout", "{}", cookie), 200)
		requireStatus(t, call(reopened, "GET", "/api/pages/dashboard", "", cookie), 401)
		server = reopened
	}
}

func TestRegistrationAndOriginRules(t *testing.T) {
	t.Setenv("EDUMIND_LOCAL_DEMO", "0")
	t.Setenv("EDUMIND_AUTH_DIR", t.TempDir())
	t.Setenv("EDUMIND_ORIGIN", "")
	t.Setenv("EDUMIND_ADMIN_USERNAME", "")
	t.Setenv("EDUMIND_ADMIN_PASSWORD_FILE", "")
	t.Setenv("EDUMIND_TEACHER_CODE", "instructor-invite")
	server, err := newServer()
	if err != nil {
		t.Fatal(err)
	}
	register := "/api/auth/register"
	requireStatus(t, call(server, "POST", register, `{"username":"intruder","password":"test-password","role":"admin"}`, nil), 403)
	requireStatus(t, call(server, "POST", register, `{"username":"learner","password":"test-password","role":"teacher"}`, nil), 403)
	requireStatus(t, call(server, "POST", register, `{"username":"lecturer","password":"test-password","role":"teacher","inviteCode":"instructor-invite"}`, nil), 200)
	learner := call(server, "POST", register, `{"username":"learner","password":"test-password","role":"student"}`, nil)
	requireStatus(t, learner, 200)
	cookie := learner.Result().Cookies()[0]
	requireStatus(t, call(server, "POST", "/api/auth/login", `{"username":"admin","password":"123456"}`, nil), 400)

	request := httptest.NewRequest("POST", "http://localhost:5173/api/auth/logout", strings.NewReader("{}"))
	request.Header.Set("Origin", "https://other.example")
	request.AddCookie(cookie)
	response := httptest.NewRecorder()
	server.serveAPI(response, request)
	requireStatus(t, response, 403)
	requireStatus(t, call(server, "GET", "/api/pages/checkin", "", cookie), 200)

	err = server.store.update(func(data *authData) error {
		token := digest(cookie.Value)
		prior := data.Sessions[token]
		prior.Expires = time.Now().Add(-time.Minute).Unix()
		data.Sessions[token] = prior
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	requireStatus(t, call(server, "GET", "/api/pages/dashboard", "", cookie), 401)
}
