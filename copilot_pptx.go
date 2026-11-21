package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"path"
	"regexp"
	"strings"
	"unicode/utf8"
)

const pptUploadLimit = 12 << 20
const maxPilotPages = 60
const maxPilotElements = 80
const maxPilotElementText = 6000

type pilotElement struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Text  string `json:"text"`
	Image string `json:"image,omitempty"`
}
type pilotPage struct {
	ID       string         `json:"id"`
	Title    string         `json:"title"`
	Source   string         `json:"source"`
	Elements []pilotElement `json:"elements"`
}
type pilotAsset struct {
	Mime string
	Data []byte
}
type pptNode struct {
	Name     xml.Name
	Attr     []xml.Attr
	Value    string
	Children []*pptNode
}

func pptXML(data []byte) (*pptNode, error) {
	root := &pptNode{}
	stack := []*pptNode{root}
	dec := xml.NewDecoder(bytes.NewReader(data))
	count := 0
	for {
		t, err := dec.RawToken()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, errors.New("无法读取 PPTX 内的 XML")
		}
		switch v := t.(type) {
		case xml.StartElement:
			count++
			if count > 90000 || len(stack) > 120 {
				return nil, errors.New("单页课件结构超出支持范围")
			}
			n := &pptNode{Name: v.Name, Attr: v.Attr}
			parent := stack[len(stack)-1]
			parent.Children = append(parent.Children, n)
			stack = append(stack, n)
		case xml.CharData:
			if len(stack) > 1 {
				top := stack[len(stack)-1]
				top.Value += string(v)
			}
		case xml.EndElement:
			if len(stack) < 2 || stack[len(stack)-1].Name != v.Name {
				return nil, errors.New("课件 XML 层级不完整")
			}
			stack = stack[:len(stack)-1]
		}
	}
	if len(stack) != 1 || len(root.Children) != 1 {
		return nil, errors.New("课件 XML 不完整")
	}
	return root.Children[0], nil
}
func (n *pptNode) attr(key string) string {
	for _, a := range n.Attr {
		if a.Name.Local == key {
			return a.Value
		}
	}
	return ""
}
func (n *pptNode) walk(visit func(*pptNode) bool) {
	if !visit(n) {
		return
	}
	for _, child := range n.Children {
		child.walk(visit)
	}
}
func (n *pptNode) first(key string) *pptNode {
	if n.Name.Local == key {
		return n
	}
	for _, c := range n.Children {
		if hit := c.first(key); hit != nil {
			return hit
		}
	}
	return nil
}
func formulaPart(n *pptNode) string {
	if n == nil {
		return ""
	}
	part := func(key string) string {
		for _, c := range n.Children {
			if c.Name.Local == key {
				return formulaPart(c)
			}
		}
		return ""
	}
	switch n.Name.Local {
	case "t":
		return n.Value
	case "f":
		return "(" + part("num") + ") / (" + part("den") + ")"
	case "sSup":
		return part("e") + "^(" + part("sup") + ")"
	case "sSub":
		return part("e") + "_(" + part("sub") + ")"
	case "sSubSup":
		return part("e") + "_(" + part("sub") + ")^(" + part("sup") + ")"
	case "rad":
		if d := part("deg"); d != "" {
			return "root(" + d + ", " + part("e") + ")"
		}
		return "√(" + part("e") + ")"
	case "d":
		return "(" + part("e") + ")"
	case "nary":
		op := "∑"
		if mark := n.first("chr"); mark != nil && mark.attr("val") != "" {
			op = mark.attr("val")
		}
		return op + "_(" + part("sub") + ")^(" + part("sup") + ") " + part("e")
	}
	var parts strings.Builder
	for _, c := range n.Children {
		parts.WriteString(formulaPart(c))
	}
	return parts.String()
}
func pptRelationships(n *pptNode, owner string) map[string]string {
	out := map[string]string{}
	for _, rel := range n.Children {
		if rel.Name.Local != "Relationship" || strings.EqualFold(rel.attr("TargetMode"), "External") {
			continue
		}
		target := rel.attr("Target")
		if target == "" || strings.Contains(target, ":") || strings.Contains(target, "\\") {
			continue
		}
		if strings.HasPrefix(target, "/") {
			target = strings.TrimPrefix(path.Clean(target), "/")
		} else {
			target = path.Clean(path.Join(path.Dir(owner), target))
		}
		if strings.HasPrefix(target, "ppt/") {
			out[rel.attr("Id")] = target
		}
	}
	return out
}
func boundedText(value string, limit int) string {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	r := []rune(value)
	return string(r[:limit-1]) + "…"
}

var codeLine = regexp.MustCompile(`(?m)(^|\n)\s*(def |class |import |from \w+ import |if .+:|return\b|func |for .+:|while .+:|SELECT |const |function |#include|public static|print\()`)
var mathLine = regexp.MustCompile(`^[[:alnum:]α-ωΑ-Ω_ +().^*/×÷=≤≥<>−{}∑√∫-]{2,160}[=≤≥∑√∫][[:alnum:]α-ωΑ-Ω_ +().^*/×÷=≤≥<>−{}∑√∫-]*$`)

func extractPPTX(data []byte, filename string) ([]pilotPage, map[string]pilotAsset, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil || len(data) > pptUploadLimit {
		return nil, nil, errors.New("请上传 12 MB 以内的有效 PPTX 文件")
	}
	if len(r.File) > 3500 {
		return nil, nil, errors.New("课件包内文件过多")
	}
	files := map[string]*zip.File{}
	var expanded uint64
	for _, f := range r.File {
		if f.UncompressedSize64 > 32<<20 || expanded > 96<<20-f.UncompressedSize64 {
			return nil, nil, errors.New("课件解压体积过大")
		}
		expanded += f.UncompressedSize64
		files[f.Name] = f
	}
	read := func(name string, limit int64) ([]byte, error) {
		f := files[name]
		if f == nil || f.UncompressedSize64 > uint64(limit) {
			return nil, errors.New("课件部件缺失或超限")
		}
		stream, err := f.Open()
		if err != nil {
			return nil, err
		}
		defer stream.Close()
		b, err := io.ReadAll(io.LimitReader(stream, limit+1))
		if err != nil || int64(len(b)) > limit {
			return nil, errors.New("无法读取完整课件部件")
		}
		return b, nil
	}
	parse := func(name string) (*pptNode, error) {
		b, e := read(name, 4<<20)
		if e != nil {
			return nil, e
		}
		return pptXML(b)
	}
	rels := func(owner string, required bool) (map[string]string, error) {
		name := path.Join(path.Dir(owner), "_rels", path.Base(owner)+".rels")
		if !required && files[name] == nil {
			return map[string]string{}, nil
		}
		node, e := parse(name)
		if e != nil {
			return nil, e
		}
		return pptRelationships(node, owner), nil
	}
	pres, err := parse("ppt/presentation.xml")
	if err != nil {
		return nil, nil, errors.New("没有找到演示文稿目录，请使用 .pptx 格式")
	}
	links, err := rels("ppt/presentation.xml", true)
	if err != nil {
		return nil, nil, err
	}
	list := pres.first("sldIdLst")
	if list == nil || len(list.Children) == 0 || len(list.Children) > maxPilotPages {
		return nil, nil, errors.New("每份课件须包含 1 至 60 页")
	}
	media := map[string]pilotAsset{}
	assetBytes := 0
	var pages []pilotPage
	for i, entry := range list.Children {
		if entry.Name.Local != "sldId" {
			continue
		}
		ref := ""
		for _, a := range entry.Attr {
			if a.Name.Local == "id" && a.Name.Space != "" {
				ref = a.Value
				break
			}
		}
		slide := links[ref]
		if !strings.HasPrefix(slide, "ppt/slides/") {
			return nil, nil, errors.New("课件页顺序引用无效")
		}
		node, e := parse(slide)
		if e != nil {
			return nil, nil, e
		}
		slideRels, e := rels(slide, false)
		if e != nil {
			return nil, nil, e
		}
		pg := pilotPage{Title: fmt.Sprintf("第 %d 页", i+1), Source: fmt.Sprintf("%s · 第 %d 页", boundedText(path.Base(filename), 110), i+1), Elements: []pilotElement{}}
		add := func(kind, value, img string) {
			if t := boundedText(value, maxPilotElementText); t != "" {
				pg.Elements = append(pg.Elements, pilotElement{ID: fmt.Sprintf("e%d", len(pg.Elements)+1), Kind: kind, Text: t, Image: img})
			}
		}
		node.walk(func(n *pptNode) bool {
			switch n.Name.Local {
			case "pic":
				caption := ""
				if props := n.first("cNvPr"); props != nil {
					caption = strings.TrimSpace(props.attr("descr"))
					if caption == "" {
						caption = strings.TrimSpace(props.attr("title"))
					}
				}
				if caption == "" {
					caption = "课件图片（未提供图注）"
				}
				id := ""
				if blip := n.first("blip"); blip != nil {
					asset := slideRels[blip.attr("embed")]
					if strings.HasPrefix(asset, "ppt/media/") {
						if b, err := read(asset, 4<<20); err == nil {
							mime := http.DetectContentType(b)
							conf, _, err := image.DecodeConfig(bytes.NewReader(b))
							if err == nil && conf.Width > 0 && conf.Height > 0 && int64(conf.Width)*int64(conf.Height) <= 24_000_000 && (mime == "image/png" || mime == "image/jpeg" || mime == "image/gif") {
								sum := sha256.Sum256(b)
								id = hex.EncodeToString(sum[:])
								if _, ok := media[id]; !ok {
									media[id] = pilotAsset{Mime: mime, Data: b}
									assetBytes += len(b)
								}
							}
						}
					}
				}
				if id == "" {
					caption += " · 此图片格式或尺寸暂不支持预览"
				}
				add("image", caption, id)
				return false
			case "sp", "graphicFrame":
				var textParts []string
				mono := false
				isTitle := false
				if ph := n.first("ph"); ph != nil {
					isTitle = ph.attr("type") == "title" || ph.attr("type") == "ctrTitle"
				}
				n.walk(func(v *pptNode) bool {
					switch v.Name.Local {
					case "p":
						var line strings.Builder
						v.walk(func(c *pptNode) bool {
							switch c.Name.Local {
							case "oMath":
								add("formula", formulaPart(c), "")
								return false
							case "t":
								line.WriteString(c.Value)
								return false
							case "br":
								line.WriteString("\n")
							case "latin":
								f := strings.ToLower(c.attr("typeface"))
								if strings.Contains(f, "mono") || strings.Contains(f, "courier") || strings.Contains(f, "consolas") {
									mono = true
								}
							}
							return true
						})
						if strings.TrimSpace(line.String()) != "" {
							textParts = append(textParts, line.String())
						}
						return false
					}
					return true
				})
				t := strings.TrimSpace(strings.Join(textParts, "\n"))
				if t != "" {
					if isTitle {
						pg.Title = boundedText(t, 130)
					} else {
						kind := "text"
						if mono || codeLine.MatchString(t) {
							kind = "code"
						} else if mathLine.MatchString(t) {
							kind = "formula"
						}
						add(kind, t, "")
					}
				}
				return false
			}
			return true
		})
		if len(pg.Elements) > maxPilotElements || assetBytes > 16<<20 {
			return nil, nil, errors.New("单页元素或课件图片超出导入限额")
		}
		pages = append(pages, pg)
	}
	if len(pages) == 0 {
		return nil, nil, errors.New("没有可以导入的课件页")
	}
	return pages, media, nil
}
