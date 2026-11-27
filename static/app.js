const file = document.querySelector('#image');
const preview = document.querySelector('#image-preview');
let previewUrl;
file?.addEventListener('change', () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  const image = file.files[0];
  preview.hidden = true;
  if (image && image.size <= 5 * 1024 * 1024 && ['image/jpeg','image/png'].includes(image.type)) {
    previewUrl = URL.createObjectURL(image);
    preview.src = previewUrl;
    preview.hidden = false;
  }
});
