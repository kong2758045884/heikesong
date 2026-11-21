package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"
)

type shareRequestKey struct{}

func studentShareRequest(r *http.Request) bool {
	mode, _ := r.Context().Value(shareRequestKey{}).(bool)
	return mode
}

func studentShareAddress(demo bool) (string, error) {
	addr := os.Getenv("EDUMIND_STUDENT_ADDR")
	if addr == "" {
		return "", nil
	}
	if !demo {
		return "", errors.New("EDUMIND_STUDENT_ADDR 只用于本机演示")
	}
	host, port, err := net.SplitHostPort(addr)
	number, portErr := strconv.Atoi(port)
	ip := net.ParseIP(host)
	if err != nil || portErr != nil || number < 1024 || number > 65535 || ip == nil || ip.To4() == nil || !ip.IsPrivate() {
		return "", errors.New("请使用本机局域网 IPv4 地址和端口作为 EDUMIND_STUDENT_ADDR")
	}
	if os.Getenv("EDUMIND_STUDENT_STATIC_DIR") == "" {
		return "", errors.New("请指定 EDUMIND_STUDENT_STATIC_DIR，供局域网学生打开前端")
	}
	return addr, nil
}

func (s *authServer) joinBaseURL() string {
	if s.studentAddr != "" {
		return "http://" + s.studentAddr
	}
	if s.origin != nil {
		return s.origin.String()
	}
	return ""
}

func (s *authServer) studentHandler(frontend http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/", s.serveAPI)
	mux.Handle("/", frontend)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != s.studentAddr {
			http.Error(w, "此学生入口只接受本机指定的局域网地址。", http.StatusForbidden)
			return
		}
		if r.URL.Path != "/api/auth/login" && r.URL.Path != "/api/auth/register" {
			if user := s.currentUser(r); user != nil && user.Role != "student" {
				http.Error(w, "此地址供学生使用。", http.StatusForbidden)
				return
			}
		}
		mux.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), shareRequestKey{}, true)))
	})
}

func (s *authServer) serveStudentShare() {
	frontend := http.FileServer(http.Dir(os.Getenv("EDUMIND_STUDENT_STATIC_DIR")))
	server := &http.Server{
		Addr: s.studentAddr, Handler: s.studentHandler(frontend),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 16 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: time.Minute,
	}
	for {
		log.Printf("EduMind student share listening on %s", s.studentAddr)
		if err := server.ListenAndServe(); err != nil {
			log.Printf("Student share listener: %v", err)
		}
		time.Sleep(15 * time.Second)
	}
}
