package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type modelProfile struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	BaseURL string `json:"baseUrl"`
	Model   string `json:"model"`
	Key     string `json:"apiKey"`
}

type modelView struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	BaseURL string `json:"baseUrl"`
	Model   string `json:"model"`
	HasKey  bool   `json:"hasKey"`
}

type accountModels struct {
	Active   string         `json:"active"`
	Profiles []modelProfile `json:"profiles"`
}

type modelStore struct {
	mu   sync.RWMutex
	path string
	data map[string]accountModels
}

var localModel modelProfile

func openModels(dir string) (*modelStore, error) {
	store := &modelStore{path: filepath.Join(dir, "models.json"), data: map[string]accountModels{}}
	if b, err := os.ReadFile(store.path); err == nil {
		if err := json.Unmarshal(b, &store.data); err != nil {
			return nil, err
		}
		if store.data == nil {
			return nil, errors.New("模型配置格式有误")
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	return store, nil
}

func defaultModel() modelProfile {
	if key := os.Getenv("EDUMIND_AI_API_KEY"); key != "" {
		baseURL, err := modelBase(os.Getenv("EDUMIND_AI_BASE_URL"))
		if err == nil && strings.TrimSpace(os.Getenv("EDUMIND_AI_MODEL")) != "" {
			return modelProfile{ID: "local-bailian", Name: "服务端默认模型", Model: os.Getenv("EDUMIND_AI_MODEL"), BaseURL: baseURL, Key: key}
		}
	}
	if os.Getenv("EDUMIND_LOCAL_DEMO") == "1" {
		return localModel
	}
	return modelProfile{}
}

func (s *modelStore) get(owner string) accountModels {
	s.mu.RLock()
	defer s.mu.RUnlock()
	state, exists := s.data[owner]
	if !exists && defaultModel().Key != "" {
		state.Active = defaultModel().ID
	}
	return state
}

func (state accountModels) profile(id string) modelProfile {
	if fallback := defaultModel(); id != "" && id == fallback.ID {
		return fallback
	}
	for _, profile := range state.Profiles {
		if profile.ID == id {
			return profile
		}
	}
	return modelProfile{}
}

func showModels(state accountModels) any {
	profiles := []modelView{}
	if initial := defaultModel(); initial.Key != "" {
		profiles = append(profiles, modelView{initial.ID, initial.Name, initial.BaseURL, initial.Model, true})
	}
	for _, profile := range state.Profiles {
		profiles = append(profiles, modelView{profile.ID, profile.Name, profile.BaseURL, profile.Model, profile.Key != ""})
	}
	return map[string]any{"active": state.Active, "profiles": profiles}
}

func (s *modelStore) update(owner string, apply func(*accountModels) error) (any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := copyMap(s.data)
	state, exists := next[owner]
	if !exists && defaultModel().Key != "" {
		state.Active = defaultModel().ID
	}
	state.Profiles = append([]modelProfile(nil), state.Profiles...)
	if err := apply(&state); err != nil {
		return nil, err
	}
	next[owner] = state
	if err := saveJSON(s.path, next); err != nil {
		return nil, err
	}
	s.data = next
	return showModels(state), nil
}

func modelBase(value string) (string, error) {
	value = strings.TrimSpace(value)
	if !strings.Contains(value, "://") {
		value = "https://" + value
	}
	address, err := url.Parse(value)
	if err != nil || address.Scheme != "https" || address.Hostname() == "" || address.User != nil ||
		address.RawQuery != "" || address.Fragment != "" || address.RawPath != "" || (address.Port() != "" && address.Port() != "443") {
		return "", problem(400, "请填写公开的 HTTPS 模型服务地址。")
	}
	host := strings.ToLower(address.Hostname())
	ali := host == "dashscope.aliyuncs.com" || strings.HasSuffix(host, ".maas.aliyuncs.com")
	switch {
	case ali, host == "api.openai.com", host == "api.deepseek.com", host == "api.moonshot.cn", host == "open.bigmodel.cn":
	default:
		approved := false
		for _, configured := range strings.Split(os.Getenv("EDUMIND_MODEL_HOSTS"), ",") {
			if host == strings.TrimSpace(configured) {
				approved = true
			}
		}
		if !approved {
			return "", problem(400, "此模型服务域名尚未在后端配置。")
		}
	}
	path := strings.TrimSuffix(strings.TrimRight(address.Path, "/"), "/chat/completions")
	if path == "" {
		path = "/v1"
		if ali {
			path = "/compatible-mode/v1"
		} else if host == "open.bigmodel.cn" {
			path = "/api/paas/v4"
		}
	}
	if path != "/v1" && path != "/compatible-mode/v1" && path != "/api/paas/v4" {
		return "", problem(400, "请使用受支持的 OpenAI 兼容接口根地址。")
	}
	return "https://" + address.Host + path, nil
}

var modelHTTP = &http.Client{
	Timeout: 32 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

func modelChat(ctx context.Context, profile modelProfile, instruction, input string, maxTokens int) (string, error) {
	if profile.Key == "" {
		return "", problem(400, "请先在右上角设置并启用模型。")
	}
	content, err := json.Marshal(map[string]any{
		"model": profile.Model, "temperature": 0.2, "max_tokens": maxTokens,
		"messages": []map[string]string{{"role": "system", "content": instruction}, {"role": "user", "content": input}},
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, profile.BaseURL+"/chat/completions", bytes.NewReader(content))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+profile.Key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := modelHTTP.Do(req)
	if err != nil {
		return "", problem(502, "无法连接模型服务，请检查网络和 Base URL。")
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case 200:
	case 401, 403:
		return "", problem(502, "模型服务拒绝鉴权，请检查密钥和模型授权。")
	case 429:
		return "", problem(502, "模型服务调用频繁或额度不足。")
	default:
		return "", problem(502, "模型服务请求失败，请检查模型 ID 和配置。")
	}
	var result struct {
		Choices []struct {
			Message struct{ Content string } `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result); err != nil ||
		len(result.Choices) == 0 || strings.TrimSpace(result.Choices[0].Message.Content) == "" {
		return "", problem(502, "模型返回了空白或无法读取的结果。")
	}
	return strings.TrimSpace(result.Choices[0].Message.Content), nil
}

func (s *authServer) modelsRoute(w http.ResponseWriter, r *http.Request, user *account) (any, error) {
	if user.Role != "teacher" && user.Role != "admin" {
		return nil, problem(403, "当前账号不能管理模型。")
	}
	const prefix = "/api/models"
	switch r.URL.Path {
	case prefix:
		if r.Method == http.MethodGet {
			return showModels(s.models.get(user.ID)), nil
		}
		if r.Method == http.MethodPost {
			var input struct {
				modelProfile
				CredentialID string `json:"credentialId"`
			}
			if err := teachingJSON(w, r, &input, 8192); err != nil {
				return nil, err
			}
			input.Name = strings.TrimSpace(input.Name)
			input.Model = strings.TrimSpace(input.Model)
			input.Key = strings.TrimSpace(input.Key)
			if !validTeachingText(input.Name, 1, 60) || !validTeachingText(input.Model, 1, 160) {
				return nil, problem(400, "请完整填写名称和模型 ID。")
			}
			var err error
			if input.BaseURL, err = modelBase(input.BaseURL); err != nil {
				return nil, err
			}
			if input.ID, err = randomHex(12); err != nil {
				return nil, err
			}
			return s.models.update(user.ID, func(state *accountModels) error {
				if len(state.Profiles) >= 20 {
					return problem(409, "一个账号最多可保存 20 个模型。")
				}
				if input.CredentialID != "" {
					source := state.profile(input.CredentialID)
					if source.Key == "" || source.BaseURL != input.BaseURL {
						return problem(400, "只能复用同一服务地址下已配置的密钥。")
					}
					input.Key = source.Key
				}
				if !validTeachingText(input.Key, 6, 512) || strings.ContainsAny(input.Key, "\r\n") {
					return problem(400, "请填写有效的 API Key。")
				}
				state.Profiles = append(state.Profiles, input.modelProfile)
				state.Active = input.ID
				return nil
			})
		}
	case prefix + "/activate", prefix + "/test", prefix + "/remove":
		if r.Method == http.MethodPost {
			var input struct{ ID string }
			if err := teachingJSON(w, r, &input, 512); err != nil {
				return nil, err
			}
			if r.URL.Path == prefix+"/test" {
				if !s.store.admit("model-test:"+user.ID, 6, time.Minute) {
					return nil, problem(429, "请稍后再测试模型。")
				}
				profile := s.models.get(user.ID).profile(input.ID)
				if _, err := modelChat(r.Context(), profile, "Respond with OK only.", "Ping", 24); err != nil {
					return nil, err
				}
				return map[string]bool{"ok": true}, nil
			}
			return s.models.update(user.ID, func(state *accountModels) error {
				if r.URL.Path == prefix+"/activate" && input.ID == "" {
					state.Active = ""
					return nil
				}
				if state.profile(input.ID).ID == "" {
					return problem(404, "模型不存在。")
				}
				if r.URL.Path == prefix+"/activate" {
					state.Active = input.ID
					return nil
				}
				for i, profile := range state.Profiles {
					if profile.ID == input.ID {
						state.Profiles = append(state.Profiles[:i], state.Profiles[i+1:]...)
						if state.Active == input.ID {
							state.Active = ""
						}
						return nil
					}
				}
				return problem(409, "预置模型无需删除，可切换到本地提取。")
			})
		}
	}
	return nil, problem(405, "此模型操作不受支持。")
}
