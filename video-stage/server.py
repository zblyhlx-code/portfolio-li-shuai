#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Video Stage 编辑器本地服务：
   - 静态服务当前目录（index.html / slots.js / script.js / style.css / 视频）
   - POST /api/save 接收编辑器参数，直接覆盖 slots.js（落盘即生效）
   用法：python server.py  →  http://127.0.0.1:8131/?editor=1
"""
import http.server
import socketserver
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8131


class ReuseTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # 强制静态文件从 server.py 所在目录（video-stage-new）提供
        path = path.split("?", 1)[0].split("#", 1)[0]
        words = filter(None, path.split("/"))
        return os.path.join(ROOT, *words)

    def do_POST(self):
        if self.path.rstrip("/") == "/api/save":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                data = json.loads(body)
                slots = data.get("slots", [])
                if not isinstance(slots, list) or len(slots) != 5:
                    raise ValueError("slots 必须是长度为 5 的数组")
                text = "/* 由可视化编辑器保存自动生成 —— 直接覆盖即可生效 */\n" \
                       "window.SLOTS = " + json.dumps(slots, ensure_ascii=False, indent=2) + ";\n"
                with open(os.path.join(ROOT, "slots.js"), "w", encoding="utf-8") as f:
                    f.write(text)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(('{"ok":false,"err":"%s"}' % str(e).replace('"', '')).encode())
            return
        self.send_response(404)
        self.end_headers()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 静默，避免刷屏


if __name__ == "__main__":
    with ReuseTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("Video Stage editor serving on http://127.0.0.1:%d" % PORT)
        httpd.serve_forever()
