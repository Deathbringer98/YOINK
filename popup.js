const toggle = document.getElementById("sound-toggle");
const slider = document.getElementById("volume-slider");
const sliderRow = document.getElementById("slider-row");

chrome.storage.local.get({ yoinkSoundEnabled: true, yoinkVolume: 1 }, (s) => {
  toggle.checked = s.yoinkSoundEnabled;
  slider.value = Math.round(s.yoinkVolume * 100);
  sliderRow.style.display = s.yoinkSoundEnabled ? "flex" : "none";
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ yoinkSoundEnabled: toggle.checked });
  sliderRow.style.display = toggle.checked ? "flex" : "none";
});

slider.addEventListener("input", () => {
  chrome.storage.local.set({ yoinkVolume: slider.value / 100 });
});
