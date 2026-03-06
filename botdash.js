const botdashLoginBtn = document.getElementById("botdashLoginBtn");
const botdashAuthStatus = document.getElementById("botdashAuthStatus");
const guildSelect = document.getElementById("guildSelect");
const guildStatus = document.getElementById("guildStatus");
const bremindForm = document.getElementById("bremindForm");
const refreshCfgBtn = document.getElementById("refreshCfgBtn");
const saveStatus = document.getElementById("saveStatus");

const cfgEnabled = document.getElementById("cfgEnabled");
const cfgBumpChannelId = document.getElementById("cfgBumpChannelId");
const cfgPingRoleId = document.getElementById("cfgPingRoleId");
const cfgRemindMinutes = document.getElementById("cfgRemindMinutes");
const cfgMentionLastBumper = document.getElementById("cfgMentionLastBumper");
const cfgUseEmbed = document.getElementById("cfgUseEmbed");
const cfgRemindColor = document.getElementById("cfgRemindColor");
const cfgRemindTitle = document.getElementById("cfgRemindTitle");
const cfgRemindDescription = document.getElementById("cfgRemindDescription");
const cfgResponseMessage = document.getElementById("cfgResponseMessage");

let selectedGuildId = "";
let loggedIn = false;

function setAuthStatus(text, tone) {
  if (!botdashAuthStatus) return;
  botdashAuthStatus.textContent = text;
  botdashAuthStatus.classList.remove("ok", "warn");
  if (tone) botdashAuthStatus.classList.add(tone);
}

function setSaveStatus(text, tone) {
  if (!saveStatus) return;
  saveStatus.textContent = text;
  saveStatus.classList.remove("ok", "warn");
  if (tone) saveStatus.classList.add(tone);
}

function toggleForm(enabled) {
  if (!bremindForm) return;
  const controls = bremindForm.querySelectorAll("input, textarea, button");
  controls.forEach(el => {
    el.disabled = !enabled;
  });
}

function clearConfigForm() {
  cfgEnabled.checked = false;
  cfgBumpChannelId.value = "";
  cfgPingRoleId.value = "";
  cfgRemindMinutes.value = "120";
  cfgMentionLastBumper.checked = false;
  cfgUseEmbed.checked = true;
  cfgRemindColor.value = "#57F287";
  cfgRemindTitle.value = "";
  cfgRemindDescription.value = "";
  cfgResponseMessage.value = "";
}

function applyConfigToForm(config) {
  cfgEnabled.checked = Boolean(config.enabled);
  cfgBumpChannelId.value = config.bumpChannelId || "";
  cfgPingRoleId.value = config.pingRoleId || "";
  cfgRemindMinutes.value = String(Number(config.remindMinutes || 120));
  cfgMentionLastBumper.checked = Boolean(config.mentionLastBumper);
  cfgUseEmbed.checked = Boolean(config.useEmbed);
  cfgRemindColor.value = config.remindColor || "#57F287";
  cfgRemindTitle.value = config.remindTitle || "";
  cfgRemindDescription.value = config.remindDescription || "";
  cfgResponseMessage.value = config.responseMessage || "";
}

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  let data = {};
  try {
    data = await resp.json();
  } catch {
    data = {};
  }
  if (!resp.ok) {
    const message = data && data.error ? data.error : `HTTP ${resp.status}`;
    throw new Error(message);
  }
  return data;
}

async function loadMe() {
  try {
    const data = await fetchJson("/api/me");
    loggedIn = Boolean(data && data.loggedIn);
    if (!loggedIn) {
      setAuthStatus("Not logged in. Login with Discord to continue.", "warn");
      if (botdashLoginBtn) botdashLoginBtn.classList.remove("hidden");
      return;
    }
    setAuthStatus(`Logged in as ${data.user.username}`, "ok");
    if (botdashLoginBtn) botdashLoginBtn.classList.add("hidden");
  } catch (err) {
    loggedIn = false;
    setAuthStatus(`Auth check failed: ${err.message}`, "warn");
    if (botdashLoginBtn) botdashLoginBtn.classList.remove("hidden");
  }
}

function renderGuildOptions(guilds) {
  guildSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = guilds.length ? "Select a server" : "No admin servers found";
  guildSelect.appendChild(placeholder);

  guilds.forEach(guild => {
    const option = document.createElement("option");
    option.value = guild.id;
    option.textContent = guild.connected ? `${guild.name} (Corex connected)` : guild.name;
    guildSelect.appendChild(option);
  });

  guildSelect.disabled = guilds.length === 0;
}

async function loadGuilds() {
  if (!loggedIn) {
    guildStatus.textContent = "Login required.";
    guildSelect.disabled = true;
    return;
  }

  guildStatus.textContent = "Loading servers...";
  try {
    const data = await fetchJson("/api/botdash/guilds");
    const guilds = Array.isArray(data.guilds) ? data.guilds : [];
    renderGuildOptions(guilds);
    guildStatus.textContent = guilds.length
      ? "Choose a server to manage bump reminders."
      : "No servers with Administrator permission found.";
  } catch (err) {
    guildStatus.textContent = `Could not load servers: ${err.message}`;
    guildSelect.disabled = true;
  }
}

async function loadGuildConfig(guildId) {
  if (!guildId) {
    clearConfigForm();
    toggleForm(false);
    setSaveStatus("Pick a server to edit settings.", "");
    return;
  }

  setSaveStatus("Loading config...", "");
  try {
    const data = await fetchJson(`/api/botdash/config/${encodeURIComponent(guildId)}`);
    applyConfigToForm(data.config || {});
    toggleForm(true);
    setSaveStatus("Config loaded.", "ok");
  } catch (err) {
    toggleForm(false);
    setSaveStatus(`Could not load config: ${err.message}`, "warn");
  }
}

function formPayload() {
  return {
    enabled: cfgEnabled.checked,
    bumpChannelId: cfgBumpChannelId.value.trim(),
    pingRoleId: cfgPingRoleId.value.trim(),
    remindMinutes: Number(cfgRemindMinutes.value || 120),
    mentionLastBumper: cfgMentionLastBumper.checked,
    useEmbed: cfgUseEmbed.checked,
    remindColor: cfgRemindColor.value.trim(),
    remindTitle: cfgRemindTitle.value.trim(),
    remindDescription: cfgRemindDescription.value.trim(),
    responseMessage: cfgResponseMessage.value.trim()
  };
}

guildSelect.addEventListener("change", async () => {
  selectedGuildId = guildSelect.value;
  await loadGuildConfig(selectedGuildId);
});

refreshCfgBtn.addEventListener("click", async () => {
  await loadGuildConfig(selectedGuildId);
});

bremindForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!selectedGuildId) {
    setSaveStatus("Select a server first.", "warn");
    return;
  }

  setSaveStatus("Saving...", "");
  try {
    const data = await fetchJson(`/api/botdash/config/${encodeURIComponent(selectedGuildId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formPayload())
    });
    applyConfigToForm(data.config || {});
    setSaveStatus("Saved successfully.", "ok");
  } catch (err) {
    setSaveStatus(`Save failed: ${err.message}`, "warn");
  }
});

(async function init() {
  toggleForm(false);
  clearConfigForm();
  await loadMe();
  await loadGuilds();
})();
