const GITHUB_API = "https://api.github.com";
const SETTINGS_KEY = "anikanikAdminSettings";

const form = document.querySelector("#uploadForm");
const imageInput = document.querySelector("#image");
const preview = document.querySelector("#preview");
const dropText = document.querySelector("#dropText");
const statusBox = document.querySelector("#status");
const submitBtn = document.querySelector("#submitBtn");
const customName = document.querySelector("#customName");
const nextName = document.querySelector("#nextName");

const settingsBtn = document.querySelector("#settingsBtn");
const settingsPanel = document.querySelector("#settingsPanel");
const saveSettingsBtn = document.querySelector("#saveSettingsBtn");
const closeSettingsBtn = document.querySelector("#closeSettingsBtn");
const settingsStatus = document.querySelector("#settingsStatus");

const settingsFields = {
  token: document.querySelector("#ghToken"),
  imageOwner: document.querySelector("#imageOwner"),
  imageRepo: document.querySelector("#imageRepo"),
  imageBranch: document.querySelector("#imageBranch"),
  imageFolder: document.querySelector("#imageFolder"),
  dataOwner: document.querySelector("#dataOwner"),
  dataRepo: document.querySelector("#dataRepo"),
  dataBranch: document.querySelector("#dataBranch"),
  dataPath: document.querySelector("#dataPath"),
};

const DEFAULT_SETTINGS = {
  token: "",
  imageOwner: "reireis0033",
  imageRepo: "DatabasengANIKANIK",
  imageBranch: "main",
  imageFolder: "",
  dataOwner: "reireis0033",
  dataRepo: "anikanik-admin",
  dataBranch: "main",
  dataPath: "data.json",
};

// ---------- settings ----------

function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function populateSettingsForm() {
  const settings = getSettings();
  for (const key in settingsFields) {
    if (settingsFields[key]) settingsFields[key].value = settings[key] || "";
  }
}

function readSettingsForm() {
  const settings = {};
  for (const key in settingsFields) {
    settings[key] = settingsFields[key] ? settingsFields[key].value.trim() : "";
  }
  return settings;
}

function settingsAreComplete(settings) {
  return Boolean(
    settings.token &&
    settings.imageOwner && settings.imageRepo && settings.imageBranch &&
    settings.dataOwner && settings.dataRepo && settings.dataBranch && settings.dataPath
  );
}

settingsBtn.addEventListener("click", () => {
  populateSettingsForm();
  settingsPanel.hidden = !settingsPanel.hidden;
});

closeSettingsBtn.addEventListener("click", () => {
  settingsPanel.hidden = true;
});

saveSettingsBtn.addEventListener("click", () => {
  const settings = readSettingsForm();
  saveSettings(settings);
  settingsStatus.textContent = settingsAreComplete(settings)
    ? "✓ Settings saved."
    : "Settings saved, but some fields are still empty.";
  settingsStatus.className = "status " + (settingsAreComplete(settings) ? "success" : "");
});

populateSettingsForm();

// ---------- image preview / rename mode ----------

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  dropText.style.display = "none";
});

document.querySelectorAll('input[name="renameMode"]').forEach(radio => {
  radio.addEventListener("change", () => {
    const custom = document.querySelector('input[name="renameMode"]:checked').value === "custom";
    customName.disabled = !custom;
    nextName.textContent = custom ? "Custom" : "Automatic";
  });
});

// ---------- helpers ----------

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ""))));
}

function sanitizeCustomName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "") // drop any extension the user typed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "image";
}

function joinPath(folder, name) {
  const cleanFolder = (folder || "").replace(/^\/+|\/+$/g, "");
  return cleanFolder ? `${cleanFolder}/${name}` : name;
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function fileToWebp(file, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(img.src);
        if (!blob) {
          reject(new Error("This browser could not convert the image to WebP."));
          return;
        }
        blob.arrayBuffer().then(resolve).catch(reject);
      }, "image/webp", quality);
    };
    img.onerror = () => reject(new Error("Could not read the selected image."));
    img.src = URL.createObjectURL(file);
  });
}

// ---------- GitHub API ----------

async function ghRequest(path, options = {}) {
  const settings = getSettings();
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${settings.token}`,
      "Accept": "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 404) {
    const err = new Error("404 Not Found");
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    let message = `GitHub API error (${res.status})`;
    try {
      const body = await res.json();
      if (body.message) message += `: ${body.message}`;
    } catch {
      // ignore
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getNextAutomaticNumber(settings) {
  const folder = (settings.imageFolder || "").replace(/^\/+|\/+$/g, "");
  const listPath = `/repos/${settings.imageOwner}/${settings.imageRepo}/contents/${folder ? encodePath(folder) : ""}?ref=${encodeURIComponent(settings.imageBranch)}`;

  let entries = [];
  try {
    entries = await ghRequest(listPath);
    if (!Array.isArray(entries)) entries = [];
  } catch (err) {
    if (err.status === 404) {
      entries = []; // folder/repo not created yet -> start at 1
    } else {
      throw err;
    }
  }

  let max = 0;
  for (const entry of entries) {
    const match = /^(\d{6})\.[a-z0-9]+$/i.exec(entry.name);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max + 1;
}

async function uploadImageToGitHub(settings, filename, contentBuffer) {
  const fullPath = joinPath(settings.imageFolder, filename);
  const base64Content = arrayBufferToBase64(contentBuffer);

  await ghRequest(`/repos/${settings.imageOwner}/${settings.imageRepo}/contents/${encodePath(fullPath)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Add image ${filename}`,
      content: base64Content,
      branch: settings.imageBranch,
    }),
  });

  return {
    path: fullPath,
    rawUrl: `https://raw.githubusercontent.com/${settings.imageOwner}/${settings.imageRepo}/${settings.imageBranch}/${fullPath}`,
  };
}

async function appendProductToDataJson(settings, product) {
  const dataPath = (settings.dataPath || "data.json").replace(/^\/+/, "");
  const contentsUrl = `/repos/${settings.dataOwner}/${settings.dataRepo}/contents/${encodePath(dataPath)}?ref=${encodeURIComponent(settings.dataBranch)}`;

  let sha = null;
  let list = [];
  try {
    const existing = await ghRequest(contentsUrl);
    sha = existing.sha;
    const text = base64ToUtf8(existing.content);
    const parsed = JSON.parse(text);
    list = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.status !== 404) throw err;
    // file doesn't exist yet -> we'll create it
  }

  list.push(product);

  await ghRequest(`/repos/${settings.dataOwner}/${settings.dataRepo}/contents/${encodePath(dataPath)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Add product ${product.filename}`,
      content: utf8ToBase64(JSON.stringify(list, null, 2)),
      branch: settings.dataBranch,
      ...(sha ? { sha } : {}),
    }),
  });
}

function setStatus(message, kind) {
  statusBox.textContent = message;
  statusBox.className = "status " + (kind || "");
}

// ---------- submit ----------

form.addEventListener("submit", async e => {
  e.preventDefault();

  const settings = getSettings();
  if (!settingsAreComplete(settings)) {
    setStatus("✕ Set your GitHub token and repository details in Settings first.", "error");
    settingsPanel.hidden = false;
    return;
  }

  const file = imageInput.files[0];
  if (!file) {
    setStatus("✕ Choose an image first.", "error");
    return;
  }

  const renameMode = document.querySelector('input[name="renameMode"]:checked').value;
  const formData = new FormData(form);
  const title = formData.get("title");
  const price = formData.get("price");
  const description = formData.get("description") || "";
  const category = formData.get("category");
  const tags = document.querySelectorAll('input[name="tags"]:checked');
  const tagList = Array.from(tags).map(t => t.value);

  submitBtn.disabled = true;
  try {
    setStatus("Optimizing image...", "");
    const webpBuffer = await fileToWebp(file);

    let filename;
    if (renameMode === "custom") {
      const custom = sanitizeCustomName(customName.value || title || "image");
      filename = `${custom}.webp`;
    } else {
      setStatus("Checking existing files...", "");
      const nextNumber = await getNextAutomaticNumber(settings);
      filename = `${String(nextNumber).padStart(6, "0")}.webp`;
    }

    setStatus(`Uploading ${filename} to ${settings.imageRepo}...`, "");
    const { path, rawUrl } = await uploadImageToGitHub(settings, filename, webpBuffer);

    setStatus("Saving product details to data.json...", "");
    const product = {
      filename,
      path,
      imageUrl: rawUrl,
      title,
      price: Number(price),
      description,
      category,
      tags: tagList,
      uploadedAt: new Date().toISOString(),
    };
    await appendProductToDataJson(settings, product);

    setStatus(`✓ Added ${filename} to ${settings.imageRepo} and updated ${settings.dataRepo}/${settings.dataPath}`, "success");
    form.reset();
    customName.disabled = true;
    preview.style.display = "none";
    dropText.style.display = "block";
    nextName.textContent = "Automatic";
  } catch (error) {
    setStatus(`✕ ${error.message}`, "error");
  } finally {
    submitBtn.disabled = false;
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[c]));
}
