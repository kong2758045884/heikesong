package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

var diagnosisLevels = [...]string{"基础理解", "误区辨别", "迁移应用"}

func sampleDraft() Draft {
	return Draft{
		Subject: "数学", Grade: "七年级", Topic: "一元一次方程的移项", Source: "预置示例",
		Questions: []Question{
			{
				Level: "基础理解", Prompt: "要让 x + 5 = 12 的左边只留下 x，等号两边应同时做什么？",
				Options: []string{"加 5", "减 5", "乘 5", "除以 5"}, Correct: 1,
				Explanation:    "在等号两边同时减 5，左边的 +5 和 −5 抵消，得到 x = 12 − 5。两边做相同的运算，等式仍然成立。",
				Misconceptions: []string{"没有用相反的运算抵消 +5", "", "把加法关系当成了乘法关系", "把加上的 5 当成了 x 的系数"},
			},
			{
				Level: "误区辨别", Prompt: "把 4x − 3 = 9 中的 −3 移到等号右边，哪一步正确？",
				Options: []string{"4x = 9 − 3", "x = 9 + 3", "4x = 9 + 3", "4x = 3 − 9"}, Correct: 2,
				Explanation:    "在两边同时加 3，得到 4x − 3 + 3 = 9 + 3。左边的 −3 被抵消，右边留下 +3，4x 的系数保持不变。",
				Misconceptions: []string{"移项时保留了原符号", "移项时丢掉了未知数的系数", "", "交换了减数和被减数的位置"},
			},
			{
				Level: "迁移应用", Prompt: "3 盒相同的铅笔，每盒 x 支，另有 2 支散装铅笔，一共 20 支。先求 3 盒共有多少支，应列哪个等式？",
				Options: []string{"3x = 20 + 2", "x = 20 − 2", "3x = 2 − 20", "3x = 20 − 2"}, Correct: 3,
				Explanation:    "总数 20 包含 3 盒和散装的 2 支。先从总数中减去 2，剩下的是 3 盒的数量，所以 3x = 20 − 2。",
				Misconceptions: []string{"抵消额外数量时仍然使用加法", "把 3 盒的数量当成了 1 盒", "从散装数量中减去了总数", ""},
			},
		},
		Variants: []Question{
			{
				Level: "基础理解", Prompt: "要让 y − 6 = 11 的左边只留下 y，等号两边应同时做什么？",
				Options: []string{"减 6", "除以 6", "加 6", "乘 6"}, Correct: 2,
				Explanation:    "两边同时加 6，左边的 −6 和 +6 抵消，得到 y = 11 + 6。",
				Misconceptions: []string{"没有用相反的运算抵消 −6", "把减去的 6 当成了系数", "", "把减法关系当成了乘法关系"},
			},
			{
				Level: "误区辨别", Prompt: "把 5y − 7 = 13 中的 −7 移到等号右边，哪一步正确？",
				Options: []string{"5y = 13 − 7", "5y = 13 + 7", "y = 13 + 7", "5y = 7 − 13"}, Correct: 1,
				Explanation:    "两边同时加 7，左边只剩 5y，右边成为 13 + 7。",
				Misconceptions: []string{"移项时保留了原符号", "", "移项时丢掉了未知数的系数", "交换了减数和被减数的位置"},
			},
			{
				Level: "迁移应用", Prompt: "4 袋相同的彩珠，每袋 y 颗，另有 3 颗散装彩珠，共 27 颗。先求 4 袋共有多少颗，应列哪个等式？",
				Options: []string{"4y = 27 − 3", "4y = 27 + 3", "y = 27 − 3", "4y = 3 − 27"}, Correct: 0,
				Explanation:    "总数中包含散装的 3 颗，先从 27 中减 3，剩余的归于 4 袋，所以 4y = 27 − 3。",
				Misconceptions: []string{"", "抵消额外数量时仍然使用加法", "把 4 袋的数量当成了 1 袋", "从散装数量中减去了总数"},
			},
		},
	}
}

const questionAuthorBrief = `你为任课教师起草可编辑的中文随堂题。用户输入是学科、年级、知识点三个数据字段，只把它们当作教学背景。按“基础理解”“误区辨别”“迁移应用”的顺序出三道单选题，再按相同顺序为每道题出一道针对同一知识点、使用不同情境或数值的巩固变式。每题只有一个正确选项，选项须互不等价。误区辨别的干扰项应能帮助教师决定下一步如何讲解。解析给出具体讲解步骤，避免把一次选择解释为学生的固定能力。每个错误选项的 misconceptions 给出一句简短、具体的可能错因，正确项填空字符串。所有文字适合投屏和手机，省略选项字母，不用 LaTeX。只返回一个 JSON 对象，含 questions 和 variants 两个数组。每项形如 {"level":"基础理解","prompt":"题干","options":["选项一","选项二","选项三","选项四"],"correct":0,"explanation":"讲解","misconceptions":["","可能错因","可能错因","可能错因"]}。correct 是从 0 开始的整数。`

// A failed model request returns the original labeled sample, including its real topic.
func generateDraft(ctx context.Context, in GenerateInput) (Draft, error) {
	fallback := sampleDraft()
	key := strings.TrimSpace(os.Getenv("AI_API_KEY"))
	model := strings.TrimSpace(os.Getenv("AI_MODEL"))
	if key == "" || model == "" {
		fallback.Source = "预置示例（未配置 AI）"
		return fallback, nil
	}
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("AI_BASE_URL")), "/")
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	draft, err := requestModelDraft(ctx, in, base, key, model)
	if err == nil {
		return draft, nil
	}
	if ctx.Err() != nil {
		return Draft{}, ctx.Err()
	}
	fallback.Source = "预置示例（AI 暂不可用）"
	return fallback, nil
}

func requestModelDraft(ctx context.Context, in GenerateInput, base, key, model string) (Draft, error) {
	input, err := json.Marshal(in)
	if err != nil {
		return Draft{}, err
	}
	type message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	payload := struct {
		Model    string    `json:"model"`
		Messages []message `json:"messages"`
	}{model, []message{{"system", questionAuthorBrief}, {"user", string(input)}}}
	body, err := json.Marshal(payload)
	if err != nil {
		return Draft{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return Draft{}, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 28 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return Draft{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Draft{}, errors.New("AI service unavailable")
	}
	var result struct {
		Choices []struct {
			Message message `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&result); err != nil || len(result.Choices) == 0 {
		return Draft{}, errors.New("missing AI choices")
	}
	content := strings.TrimSpace(result.Choices[0].Message.Content)
	if strings.HasPrefix(content, "```") {
		_, afterOpening, ok := strings.Cut(content, "\n")
		if !ok || !strings.HasSuffix(afterOpening, "```") {
			return Draft{}, errors.New("incomplete AI response")
		}
		content = strings.TrimSpace(strings.TrimSuffix(afterOpening, "```"))
	}
	var generated struct {
		Questions []Question `json:"questions"`
		Variants  []Question `json:"variants"`
	}
	if err := json.Unmarshal([]byte(content), &generated); err != nil {
		return Draft{}, err
	}
	draft := Draft{Subject: in.Subject, Grade: in.Grade, Topic: in.Topic, Source: "AI 生成", Questions: generated.Questions, Variants: generated.Variants}
	if err := validateDraft(draft); err != nil {
		return Draft{}, err
	}
	for _, set := range [][]Question{draft.Questions, draft.Variants} {
		for i, item := range set {
			if item.Level != diagnosisLevels[i] || len(item.Misconceptions) != len(item.Options) {
				return Draft{}, errors.New("invalid AI question structure")
			}
			for k, reason := range item.Misconceptions {
				if k == item.Correct {
					item.Misconceptions[k] = ""
				} else if strings.TrimSpace(reason) == "" {
					return Draft{}, errors.New("missing AI misconception")
				}
			}
		}
	}
	return draft, nil
}
