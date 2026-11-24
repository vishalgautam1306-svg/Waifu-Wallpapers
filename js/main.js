import { AppUI } from "./ui.js";

const COLLECTION_DB = "waifu-wallpapers-preview";

async function loadFromGallery() {
    const query = new URLSearchParams(location.search);
    const selectedId = query.get("fromGallery");
    if (!selectedId) return;
    let db;
    try {
        db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(COLLECTION_DB, 1);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains("wallpapers")) {
                    database.createObjectStore("wallpapers", {keyPath:"id"});
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const item = await new Promise((resolve, reject) => {
            const request = db.transaction("wallpapers", "readonly").objectStore("wallpapers").get(selectedId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        if (!item?.blob) throw new Error("The selected image was not found in this browser");
        const file = new File([item.blob], item.filename || "wallpaper.png", {type:item.mime || "image/png"});
        const files = new DataTransfer();
        files.items.add(file);

        const modelInput = document.querySelector("select[name=model]");
        if (modelInput) {
            modelInput.value = "swin_unet.art"; // Supports 2× and direct 4×.
            modelInput.dispatchEvent(new Event("change", {bubbles:true}));
        }
        const scaleInput = document.querySelector("select[name=scale]");
        if (scaleInput) {
            scaleInput.value = query.get("scale") === "4" ? "4" : "2";
            scaleInput.dispatchEvent(new Event("change", {bubbles:true}));
        }
        const input = document.getElementById("file");
        input.files = files.files;
        input.dispatchEvent(new Event("change", {bubbles:true}));
        const status = document.getElementById("status-title");
        if (status) status.textContent = "Wallpaper loaded from your gallery";
        history.replaceState(null, "", location.pathname);
    } catch (error) {
        console.error("Failed to load gallery image", error);
        const msg = document.getElementById("message");
        if (msg) msg.textContent = "Could not restore gallery wallpaper: " + error.message;
    } finally {
        if (db) db.close();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (typeof ort !== "undefined") {
        ort.env.wasm.proxy = true;
        ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    }
    new AppUI();
    loadFromGallery();
});
