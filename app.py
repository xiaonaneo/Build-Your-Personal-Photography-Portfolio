import json
import hashlib
import hmac
import logging
import mimetypes
import os
import posixpath
import sqlite3
import time
import uuid
from http.cookies import SimpleCookie
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "data")).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "site.sqlite3"
DEFAULT_CONFIG_PATH = ROOT / "default-config.json"
ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_SIZE = 5 * 1024 * 1024
SESSION_COOKIE = "echo37_admin"
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
MAX_AUTH_BODY_SIZE = 64 * 1024
MAX_CONFIG_BODY_SIZE = 1 * 1024 * 1024
MAX_UPLOAD_BODY_SIZE = 25 * 1024 * 1024
MAX_COLLECTIONS = 50
MAX_PHOTOS_PER_COLLECTION = 200
MAX_TOTAL_PHOTOS = 500
MAX_NAME_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 500
MAX_ALT_LENGTH = 300
MAX_SOURCE_LENGTH = 2048
MAX_FILES_PER_REQUEST = 20
CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; connect-src 'self'"
LOGGER = logging.getLogger(__name__)


def ensure_storage():
  DATA_DIR.mkdir(parents=True, exist_ok=True)
  UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
  with sqlite3.connect(DB_PATH) as conn:
    conn.execute(
      """
      create table if not exists site_config (
        id integer primary key check (id = 1),
        config_json text not null,
        updated_at text default current_timestamp
      )
      """
    )
    existing = conn.execute("select 1 from site_config where id = 1").fetchone()
    if existing is None:
      conn.execute(
        "insert into site_config (id, config_json) values (1, ?)",
        (DEFAULT_CONFIG_PATH.read_text(encoding="utf-8"),),
      )


def read_config():
  ensure_storage()
  with sqlite3.connect(DB_PATH) as conn:
    row = conn.execute("select config_json from site_config where id = 1").fetchone()
  return json.loads(row[0])


def write_config(config):
  ensure_storage()
  payload = json.dumps(config, ensure_ascii=False)
  with sqlite3.connect(DB_PATH) as conn:
    conn.execute(
      """
      insert into site_config (id, config_json, updated_at)
      values (1, ?, current_timestamp)
      on conflict(id) do update set
        config_json = excluded.config_json,
        updated_at = current_timestamp
      """,
      (payload,),
    )


def safe_upload_name(filename, detected_type=None):
  suffix_by_type = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
  suffix = suffix_by_type.get(detected_type, Path(filename or "").suffix.lower())
  if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
    suffix = ".jpg"
  return f"{uuid.uuid4().hex}{suffix}"


def detect_image_type(content):
  if content[:3] == b"\xff\xd8\xff":
    return "image/jpeg"
  if content[:8] == b"\x89PNG\r\n\x1a\n":
    return "image/png"
  if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
    return "image/webp"
  return None


def is_allowed_image_source(source):
  if source.startswith("/uploads/") and ".." not in source:
    return True
  parsed = urlparse(source)
  return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def validate_config(config):
  if not isinstance(config, dict):
    return "配置格式无效。"
  name = config.get("name", "")
  if not isinstance(name, str) or len(name) > MAX_NAME_LENGTH:
    return "网站名称过长或格式无效。"
  collections = config.get("collections")
  if not isinstance(collections, list):
    return None
  if len(collections) > MAX_COLLECTIONS:
    return "作品集数量超过上限。"

  total_photos = 0
  for collection in collections:
    if not isinstance(collection, dict):
      return "作品集格式无效。"
    collection_name = collection.get("name", "")
    if not isinstance(collection_name, str) or len(collection_name) > MAX_NAME_LENGTH:
      return "作品集名称过长或格式无效。"
    collection_description = collection.get("description", "")
    if not isinstance(collection_description, str) or len(collection_description) > MAX_DESCRIPTION_LENGTH:
      return "作品集简介过长或格式无效。"
    photos = collection.get("photos")
    if not isinstance(photos, list):
      return "作品集图片格式无效。"
    if len(photos) > MAX_PHOTOS_PER_COLLECTION:
      return "单个作品集图片数量超过上限。"
    total_photos += len(photos)
    for photo in photos:
      if not isinstance(photo, dict):
        return "图片格式无效。"
      source = str(photo.get("src", "")).strip()
      alt = str(photo.get("alt", "摄影作品")).strip()
      if len(source) > MAX_SOURCE_LENGTH or not is_allowed_image_source(source):
        return "图片地址无效。"
      if len(alt) > MAX_ALT_LENGTH:
        return "图片描述过长。"
  return "图片总数超过上限。" if total_photos > MAX_TOTAL_PHOTOS else None


def auth_secrets():
  return os.environ.get("ADMIN_PASSWORD", ""), os.environ.get("SESSION_SECRET", "")


def auth_configured():
  password, secret = auth_secrets()
  return bool(password and len(secret) >= 32)


def auth_digest(value, secret):
  return hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).digest()


def create_session_token():
  password, secret = auth_secrets()
  expires_at = int(time.time()) + SESSION_TTL_SECONDS
  password_version = auth_digest(password, secret).hex()
  payload = f"v1.{expires_at}.{password_version}"
  signature = auth_digest(payload, secret).hex()
  return f"{payload}.{signature}"


def read_session(headers):
  cookie = SimpleCookie()
  cookie.load(headers.get("Cookie", ""))
  morsel = cookie.get(SESSION_COOKIE)
  return morsel.value if morsel else ""


def is_authenticated(headers):
  password, secret = auth_secrets()
  token = read_session(headers)
  parts = token.split(".")
  if not password or len(secret) < 32 or len(parts) != 4 or parts[0] != "v1":
    return False
  try:
    expires_at = int(parts[1])
  except ValueError:
    return False
  if expires_at <= int(time.time()) or not hmac.compare_digest(parts[2], auth_digest(password, secret).hex()):
    return False
  payload = ".".join(parts[:3])
  expected_signature = auth_digest(payload, secret).hex()
  return hmac.compare_digest(parts[3], expected_signature)


def parse_multipart(body, content_type):
  marker = "boundary="
  if marker not in content_type:
    return []
  boundary = content_type.split(marker, 1)[1].strip().strip('"')
  delimiter = f"--{boundary}".encode("utf-8")
  files = []

  for part in body.split(delimiter):
    part = part.strip(b"\r\n")
    if not part or part == b"--" or b"\r\n\r\n" not in part:
      continue

    header_blob, payload = part.split(b"\r\n\r\n", 1)
    headers = header_blob.decode("utf-8", errors="ignore").split("\r\n")
    disposition = next((header for header in headers if header.lower().startswith("content-disposition:")), "")
    if 'name="photos"' not in disposition or "filename=" not in disposition:
      continue

    filename = disposition.split("filename=", 1)[1].strip().strip('"')
    content_type = next((header.split(":", 1)[1].strip() for header in headers if header.lower().startswith("content-type:")), "")
    files.append({
      "filename": filename,
      "content_type": content_type,
      "content": payload.rstrip(b"\r\n"),
    })

  return files


class PortfolioHandler(SimpleHTTPRequestHandler):
  def __init__(self, *args, **kwargs):
    super().__init__(*args, directory=str(ROOT), **kwargs)

  def end_headers(self):
    self.send_header("Cache-Control", "no-store")
    self.send_header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
    self.send_header("X-Content-Type-Options", "nosniff")
    self.send_header("X-Frame-Options", "DENY")
    self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
    self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    super().end_headers()

  def send_json(self, payload, status=HTTPStatus.OK, extra_headers=None):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    for name, value in (extra_headers or {}).items():
      self.send_header(name, value)
    self.end_headers()
    self.wfile.write(body)

  def require_admin(self):
    if not auth_configured():
      self.send_json({"code": "AUTH_NOT_CONFIGURED", "message": "管理员认证尚未配置。"}, HTTPStatus.INTERNAL_SERVER_ERROR)
      return False
    if not is_authenticated(self.headers):
      self.send_json({"code": "AUTH_REQUIRED", "message": "请先登录管理员后台。"}, HTTPStatus.UNAUTHORIZED)
      return False
    return True

  def secure_cookie(self):
    return os.environ.get("COOKIE_SECURE", "").lower() in {"1", "true", "yes"} or self.headers.get("X-Forwarded-Proto") == "https"

  def login(self):
    length = int(self.headers.get("Content-Length", "0"))
    if length < 0 or length > MAX_AUTH_BODY_SIZE:
      self.send_json({"code": "REQUEST_TOO_LARGE", "message": "请求过大。"}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
      return
    try:
      body = json.loads(self.rfile.read(length).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
      self.send_json({"code": "INVALID_REQUEST", "message": "请求格式无效。"}, HTTPStatus.BAD_REQUEST)
      return
    password, secret = auth_secrets()
    if not auth_configured():
      self.send_json({"code": "AUTH_NOT_CONFIGURED", "message": "管理员认证尚未配置。"}, HTTPStatus.INTERNAL_SERVER_ERROR)
      return
    supplied = body.get("password") if isinstance(body, dict) else None
    if not isinstance(supplied, str) or not hmac.compare_digest(auth_digest(supplied, secret), auth_digest(password, secret)):
      self.send_json({"code": "AUTH_INVALID", "message": "密码不正确。"}, HTTPStatus.UNAUTHORIZED)
      return
    secure = "; Secure" if self.secure_cookie() else ""
    cookie = f"{SESSION_COOKIE}={create_session_token()}; Max-Age={SESSION_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Strict{secure}"
    self.send_json({"authenticated": True}, extra_headers={"Set-Cookie": cookie})

  def logout(self):
    self.send_json({"authenticated": False}, extra_headers={"Set-Cookie": f"{SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict"})

  def do_GET(self):
    if self.path == "/api/auth":
      self.send_json({"authenticated": is_authenticated(self.headers)})
      return
    if self.path == "/api/config":
      self.send_json(read_config())
      return
    if self.path.startswith("/uploads/"):
      self.serve_upload()
      return
    super().do_GET()

  def do_HEAD(self):
    if self.path.startswith("/uploads/"):
      self.serve_upload(head_only=True)
      return
    super().do_HEAD()

  def do_POST(self):
    if self.path == "/api/auth":
      self.login()
      return
    if self.path == "/api/config":
      if not self.require_admin():
        return
      self.save_config()
      return
    if self.path == "/api/upload":
      if not self.require_admin():
        return
      self.upload_files()
      return
    self.send_error(HTTPStatus.NOT_FOUND)

  def do_DELETE(self):
    if self.path == "/api/auth":
      self.logout()
      return
    self.send_error(HTTPStatus.NOT_FOUND)

  def save_config(self):
    try:
      length = int(self.headers.get("Content-Length", "0"))
    except ValueError:
      self.send_json({"code": "INVALID_REQUEST", "message": "请求格式无效。"}, HTTPStatus.BAD_REQUEST)
      return
    if length < 0 or length > MAX_CONFIG_BODY_SIZE:
      self.send_json({"code": "REQUEST_TOO_LARGE", "message": "请求过大。"}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
      return
    try:
      payload = json.loads(self.rfile.read(length).decode("utf-8"))
      validation_error = validate_config(payload)
      if validation_error:
        self.send_json({"code": "INVALID_CONFIG", "message": validation_error}, HTTPStatus.BAD_REQUEST)
        return
      write_config(payload)
      self.send_json({"ok": True})
    except (UnicodeDecodeError, json.JSONDecodeError):
      self.send_json({"code": "INVALID_REQUEST", "message": "请求格式无效。"}, HTTPStatus.BAD_REQUEST)
    except Exception:
      LOGGER.exception("configuration save failed")
      self.send_json({"code": "CONFIG_SAVE_FAILED", "message": "配置保存失败。"}, HTTPStatus.INTERNAL_SERVER_ERROR)

  def upload_files(self):
    try:
      length = int(self.headers.get("Content-Length", "0"))
    except ValueError:
      self.send_json({"code": "INVALID_REQUEST", "message": "请求格式无效。"}, HTTPStatus.BAD_REQUEST)
      return
    if length < 0 or length > MAX_UPLOAD_BODY_SIZE:
      self.send_json({"code": "REQUEST_TOO_LARGE", "message": "上传请求过大。"}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
      return
    body = self.rfile.read(length)
    files = parse_multipart(body, self.headers.get("Content-Type", ""))
    if not files:
      self.send_json({"code": "NO_FILES", "message": "没有找到图片文件。"}, HTTPStatus.BAD_REQUEST)
      return
    if len(files) > MAX_FILES_PER_REQUEST:
      self.send_json({"code": "TOO_MANY_FILES", "message": "单次最多上传 20 张图片。"}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
      return
    if sum(len(file_info["content"]) for file_info in files) > MAX_UPLOAD_BODY_SIZE:
      self.send_json({"code": "REQUEST_TOO_LARGE", "message": "上传请求过大。"}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
      return
    uploaded = []

    for file_info in files:
      if file_info["content_type"] not in ALLOWED_UPLOAD_TYPES:
        self.send_json({"error": f"{file_info['filename']} is not JPG, PNG, or WebP."}, HTTPStatus.BAD_REQUEST)
        return
      if len(file_info["content"]) > MAX_UPLOAD_SIZE:
        self.send_json({"error": f"{file_info['filename']} is larger than 5MB."}, HTTPStatus.BAD_REQUEST)
        return

      detected_type = detect_image_type(file_info["content"])
      if detected_type != file_info["content_type"]:
        self.send_json({"code": "INVALID_IMAGE", "message": f"{file_info['filename']} 不是有效的 JPG、PNG 或 WebP 图片。"}, HTTPStatus.BAD_REQUEST)
        return

      stored_name = safe_upload_name(file_info["filename"], detected_type)
      target = UPLOAD_DIR / stored_name
      target.write_bytes(file_info["content"])
      uploaded.append({
        "src": f"/uploads/{stored_name}",
        "alt": Path(file_info["filename"]).stem or "摄影作品",
      })

    self.send_json({"photos": uploaded})

  def serve_upload(self, head_only=False):
    raw_path = self.path.split("?", 1)[0]
    relative = posixpath.normpath(raw_path.removeprefix("/uploads/"))
    target = (UPLOAD_DIR / relative).resolve()
    if not target.is_relative_to(UPLOAD_DIR) or not target.is_file():
      self.send_error(HTTPStatus.NOT_FOUND)
      return
    self.path = f"/{target.relative_to(DATA_DIR).as_posix()}"
    self.directory = str(DATA_DIR)
    if head_only:
      super().do_HEAD()
    else:
      super().do_GET()


def wsgi_headers(environ):
  return {
    "Cookie": environ.get("HTTP_COOKIE", ""),
    "X-Forwarded-Proto": environ.get("HTTP_X_FORWARDED_PROTO", ""),
  }


def wsgi_response(start_response, status, body, extra_headers=None, content_type="application/json; charset=utf-8"):
  if isinstance(body, str):
    body = body.encode("utf-8")
  headers = [
    ("Content-Type", content_type),
    ("Content-Length", str(len(body))),
    ("Content-Security-Policy", CONTENT_SECURITY_POLICY),
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
  ]
  headers.extend((extra_headers or {}).items())
  start_response(f"{status.value} {status.phrase}", headers)
  return [body]


def wsgi_json(start_response, payload, status=HTTPStatus.OK, extra_headers=None):
  return wsgi_response(start_response, status, json.dumps(payload, ensure_ascii=False), extra_headers)


def wsgi_read_body(environ, limit):
  try:
    length = int(environ.get("CONTENT_LENGTH", "0"))
  except ValueError:
    return None, HTTPStatus.BAD_REQUEST
  if length < 0 or length > limit:
    return None, HTTPStatus.REQUEST_ENTITY_TOO_LARGE
  return environ["wsgi.input"].read(length), None


def wsgi_require_admin(environ, start_response):
  headers = wsgi_headers(environ)
  if not auth_configured():
    return wsgi_json(start_response, {"code": "AUTH_NOT_CONFIGURED", "message": "管理员认证尚未配置。"}, HTTPStatus.INTERNAL_SERVER_ERROR)
  if not is_authenticated(headers):
    return wsgi_json(start_response, {"code": "AUTH_REQUIRED", "message": "请先登录管理员后台。"}, HTTPStatus.UNAUTHORIZED)
  return None


def application(environ, start_response):
  """Production WSGI entrypoint for Gunicorn; local `python3 app.py` remains dev-only."""
  method = environ.get("REQUEST_METHOD", "GET").upper()
  path = environ.get("PATH_INFO", "/")
  headers = wsgi_headers(environ)

  if path == "/api/auth":
    if method == "GET":
      return wsgi_json(start_response, {"authenticated": is_authenticated(headers)})
    if method == "DELETE":
      return wsgi_json(start_response, {"authenticated": False}, extra_headers={"Set-Cookie": f"{SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict"})
    if method == "POST":
      body, error = wsgi_read_body(environ, MAX_AUTH_BODY_SIZE)
      if error:
        return wsgi_json(start_response, {"code": "REQUEST_TOO_LARGE", "message": "请求过大。"}, error)
      try:
        payload = json.loads(body.decode("utf-8"))
      except (UnicodeDecodeError, json.JSONDecodeError):
        return wsgi_json(start_response, {"code": "INVALID_REQUEST", "message": "请求格式无效。"}, HTTPStatus.BAD_REQUEST)
      password, secret = auth_secrets()
      supplied = payload.get("password") if isinstance(payload, dict) else None
      if not auth_configured():
        return wsgi_json(start_response, {"code": "AUTH_NOT_CONFIGURED", "message": "管理员认证尚未配置。"}, HTTPStatus.INTERNAL_SERVER_ERROR)
      if not isinstance(supplied, str) or not hmac.compare_digest(auth_digest(supplied, secret), auth_digest(password, secret)):
        return wsgi_json(start_response, {"code": "AUTH_INVALID", "message": "密码不正确。"}, HTTPStatus.UNAUTHORIZED)
      secure = "; Secure" if os.environ.get("COOKIE_SECURE", "").lower() in {"1", "true", "yes"} or headers.get("X-Forwarded-Proto") == "https" else ""
      cookie = f"{SESSION_COOKIE}={create_session_token()}; Max-Age={SESSION_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Strict{secure}"
      return wsgi_json(start_response, {"authenticated": True}, extra_headers={"Set-Cookie": cookie})
    return wsgi_response(start_response, HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed", content_type="text/plain; charset=utf-8")

  if path == "/api/config":
    if method == "GET":
      return wsgi_json(start_response, read_config())
    if method == "POST":
      denied = wsgi_require_admin(environ, start_response)
      if denied:
        return denied
      body, error = wsgi_read_body(environ, MAX_CONFIG_BODY_SIZE)
      if error:
        return wsgi_json(start_response, {"code": "REQUEST_TOO_LARGE", "message": "请求过大。"}, error)
      try:
        payload = json.loads(body.decode("utf-8"))
        validation_error = validate_config(payload)
        if validation_error:
          return wsgi_json(start_response, {"code": "INVALID_CONFIG", "message": validation_error}, HTTPStatus.BAD_REQUEST)
        write_config(payload)
      except (UnicodeDecodeError, json.JSONDecodeError, sqlite3.Error, TypeError, ValueError):
        return wsgi_json(start_response, {"code": "INVALID_REQUEST", "message": "配置格式无效。"}, HTTPStatus.BAD_REQUEST)
      return wsgi_json(start_response, {"ok": True})
    return wsgi_response(start_response, HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed", content_type="text/plain; charset=utf-8")

  if path == "/api/upload":
    if method != "POST":
      return wsgi_response(start_response, HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed", content_type="text/plain; charset=utf-8")
    denied = wsgi_require_admin(environ, start_response)
    if denied:
      return denied
    body, error = wsgi_read_body(environ, MAX_UPLOAD_BODY_SIZE)
    if error:
      return wsgi_json(start_response, {"code": "REQUEST_TOO_LARGE", "message": "请求过大。"}, error)
    files = parse_multipart(body, environ.get("CONTENT_TYPE", ""))
    if not files:
      return wsgi_json(start_response, {"code": "NO_FILES", "message": "没有找到图片文件。"}, HTTPStatus.BAD_REQUEST)
    if len(files) > MAX_FILES_PER_REQUEST:
      return wsgi_json(start_response, {"code": "TOO_MANY_FILES", "message": "单次最多上传 20 张图片。"}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
    if sum(len(file_info["content"]) for file_info in files) > MAX_UPLOAD_BODY_SIZE:
      return wsgi_json(start_response, {"code": "REQUEST_TOO_LARGE", "message": "上传请求过大。"}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
    uploaded = []
    ensure_storage()
    for file_info in files:
      if file_info["content_type"] not in ALLOWED_UPLOAD_TYPES:
        return wsgi_json(start_response, {"error": f"{file_info['filename']} is not JPG, PNG, or WebP."}, HTTPStatus.BAD_REQUEST)
      if len(file_info["content"]) > MAX_UPLOAD_SIZE:
        return wsgi_json(start_response, {"error": f"{file_info['filename']} is larger than 5MB."}, HTTPStatus.BAD_REQUEST)
      detected_type = detect_image_type(file_info["content"])
      if detected_type != file_info["content_type"]:
        return wsgi_json(start_response, {"code": "INVALID_IMAGE", "message": f"{file_info['filename']} 不是有效的 JPG、PNG 或 WebP 图片。"}, HTTPStatus.BAD_REQUEST)
      stored_name = safe_upload_name(file_info["filename"], detected_type)
      (UPLOAD_DIR / stored_name).write_bytes(file_info["content"])
      uploaded.append({"src": f"/uploads/{stored_name}", "alt": Path(file_info["filename"]).stem or "摄影作品"})
    return wsgi_json(start_response, {"photos": uploaded})

  if path.startswith("/uploads/") and method in {"GET", "HEAD"}:
    raw_path = path.split("?", 1)[0]
    relative = posixpath.normpath(unquote(raw_path.removeprefix("/uploads/")))
    target = (UPLOAD_DIR / relative).resolve()
    if not target.is_relative_to(UPLOAD_DIR) or not target.is_file():
      return wsgi_response(start_response, HTTPStatus.NOT_FOUND, "Not found", content_type="text/plain; charset=utf-8")
    body = target.read_bytes()
    response = wsgi_response(
      start_response,
      HTTPStatus.OK,
      b"" if method == "HEAD" else body,
      extra_headers={"Cache-Control": "public, max-age=31536000, immutable"},
      content_type=mimetypes.guess_type(target.name)[0] or "application/octet-stream",
    )
    return response

  if method not in {"GET", "HEAD"}:
    return wsgi_response(start_response, HTTPStatus.NOT_FOUND, "Not found", content_type="text/plain; charset=utf-8")
  relative = "index.html" if path == "/" else unquote(path.lstrip("/"))
  target = (ROOT / relative).resolve()
  if not target.is_relative_to(ROOT) or str(target.relative_to(ROOT)).startswith(("data", ".git")) or not target.is_file():
    return wsgi_response(start_response, HTTPStatus.NOT_FOUND, "Not found", content_type="text/plain; charset=utf-8")
  body = target.read_bytes()
  return wsgi_response(
    start_response,
    HTTPStatus.OK,
    b"" if method == "HEAD" else body,
    content_type=mimetypes.guess_type(target.name)[0] or "application/octet-stream",
  )


def main():
  ensure_storage()
  port = int(os.environ.get("PORT", "4173"))
  server = ThreadingHTTPServer(("0.0.0.0", port), PortfolioHandler)
  print(f"Serving on http://127.0.0.1:{port}")
  server.serve_forever()


if __name__ == "__main__":
  main()
