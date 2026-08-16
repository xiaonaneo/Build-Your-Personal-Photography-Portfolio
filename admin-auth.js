const loginPanel = document.querySelector("[data-login-panel]");
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const editorShell = document.querySelector("[data-editor-shell]");
const logoutButton = document.querySelector("[data-logout]");

function setAuthenticated(authenticated) {
  loginPanel.hidden = authenticated;
  editorShell.hidden = !authenticated;
  logoutButton.hidden = !authenticated;
}

async function getAuthStatus() {
  const response = await fetch("/api/auth", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Auth status unavailable");
  return response.json();
}

async function showEditor() {
  setAuthenticated(true);
  try {
    await window.initAdmin();
  } catch {
    setAuthenticated(false);
    loginStatus.textContent = "读取后台配置失败，请稍后重试。";
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = loginForm.elements.password.value;
  loginStatus.textContent = "登录中...";

  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) throw new Error("Login failed");
    loginForm.reset();
    loginStatus.textContent = "";
    await showEditor();
  } catch {
    loginStatus.textContent = "登录失败，请检查密码或服务配置。";
  }
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/auth", { method: "DELETE", credentials: "same-origin" });
  setAuthenticated(false);
  loginStatus.textContent = "已退出登录。";
});

async function initAuth() {
  setAuthenticated(false);
  try {
    const status = await getAuthStatus();
    if (status.authenticated) await showEditor();
  } catch {
    loginStatus.textContent = "认证服务暂时不可用。";
  }
}

initAuth();
