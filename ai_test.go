package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSampleQuestionsAndCorrespondingVariants(t *testing.T) {
	draft := sampleDraft()
	if err := validateDraft(draft); err != nil {
		t.Fatal(err)
	}
	for _, set := range [][]Question{draft.Questions, draft.Variants} {
		for i, q := range set {
			if q.Level != diagnosisLevels[i] || len(q.Misconceptions) != len(q.Options) || q.Misconceptions[q.Correct] != "" {
				t.Fatalf("incomplete diagnostic purpose or wrong mapping: %s", q.Prompt)
			}
			for j, m := range q.Misconceptions {
				if j != q.Correct && strings.TrimSpace(m) == "" {
					t.Fatalf("missing distractor rationale: %s, option %d", q.Prompt, j)
				}
			}
		}
	}
}

func TestUnconfiguredGeneratorPreservesFallbackIdentity(t *testing.T) {
	t.Setenv("AI_API_KEY", "")
	draft, err := generateDraft(context.Background(), GenerateInput{Subject: "语文", Grade: "八年级", Topic: "古诗意象"})
	if err != nil || draft.Source != "预置示例（未配置 AI）" || draft.Topic != sampleDraft().Topic || draft.Subject != "数学" {
		t.Fatalf("example mislabeled: %#v / %v", draft, err)
	}
}

func TestGeneratorBackendContract(t *testing.T) {
	t.Setenv("AI_API_KEY", "test-only")
	t.Setenv("AI_MODEL", "classroom-model")
	in := GenerateInput{Subject: "数学", Grade: "七年级", Topic: "移项练习"}
	raw, err := json.Marshal(sampleDraft())
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name    string
		status  int
		content string
		source  string
	}{
		{"valid", 200, string(raw), "AI 生成"},
		{"missing key", 200, strings.ReplaceAll(string(raw), `"correct":1`, `"unused":1`), "预置示例（AI 暂不可用）"},
		{"wrong level", 200, strings.ReplaceAll(string(raw), "误区辨别", "随机复习"), "预置示例（AI 暂不可用）"},
		{"invalid JSON", 200, "{", "预置示例（AI 暂不可用）"},
		{"quota", 429, "", "预置示例（AI 暂不可用）"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "POST" || r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer test-only" {
					t.Errorf("invalid upstream contract")
				}
				var payload struct {
					Model    string
					Messages []struct{ Role, Content string }
				}
				if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.Model != "classroom-model" || len(payload.Messages) != 2 || !strings.Contains(payload.Messages[1].Content, in.Topic) {
					t.Errorf("missing teaching context or model: %v", err)
				}
				w.WriteHeader(tc.status)
				json.NewEncoder(w).Encode(map[string]any{"choices": []map[string]any{{"message": map[string]string{"role": "assistant", "content": tc.content}}}})
			}))
			defer server.Close()
			t.Setenv("AI_BASE_URL", server.URL+"/v1/")
			d, err := generateDraft(context.Background(), in)
			if err != nil || d.Source != tc.source {
				t.Fatalf("source=%q err=%v", d.Source, err)
			}
			if tc.name == "valid" && d.Topic != in.Topic {
				t.Errorf("lost topic")
			}
			if tc.name != "valid" && d.Topic != sampleDraft().Topic {
				t.Errorf("mislabeled fallback topic")
			}
		})
	}
}
