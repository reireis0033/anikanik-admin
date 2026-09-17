const form = document.querySelector("#uploadForm");
const imageInput = document.querySelector("#image");
const preview = document.querySelector("#preview");
const dropText = document.querySelector("#dropText");
const statusBox = document.querySelector("#status");
const submitBtn = document.querySelector("#submitBtn");
const customName = document.querySelector("#customName");
const nextName = document.querySelector("#nextName");
const productsBox = document.querySelector("#products");

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

form.addEventListener("submit", async e => {
  e.preventDefault();
  statusBox.textContent = "Uploading → optimizing → saving...";
  submitBtn.disabled = true;

  try {
    const formData = new FormData(form);
    formData.delete("tags");
    document.querySelectorAll('input[name="tags"]:checked').forEach(tag => formData.append("tags", tag.value));

    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed.");

    statusBox.textContent = `✓ Added ${result.product.filename}`;
    form.reset();
    customName.disabled = true;
    preview.style.display = "none";
    dropText.style.display = "block";
    nextName.textContent = "Automatic";
    loadProducts();
  } catch (error) {
    statusBox.textContent = `✕ ${error.message}`;
  } finally {
    submitBtn.disabled = false;
  }
});

async function loadProducts() {
  const products = await fetch("/api/products").then(r => r.json());
  productsBox.innerHTML = products.length ? products.slice().reverse().map(p => `
    <article class="product">
      <img src="/${p.image}" alt="">
      <div class="info">
        <strong>#${p.id} · ${escapeHtml(p.filename)} · ₱${Number(p.price).toLocaleString()}</strong>
        <p>${escapeHtml(p.description || "No description")}</p>
        <div class="tags">${escapeHtml(p.category || "Uncategorized")} · ${(p.tags || []).map(escapeHtml).join(", ")}</div>
      </div>
    </article>
  `).join("") : `<p class="muted">No images yet.</p>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

document.querySelector("#refreshBtn").addEventListener("click", loadProducts);
loadProducts();
