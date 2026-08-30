export function setupFavicon() {
  const img = new Image();
  img.src = '/assets/getafe-seal.png';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Calculate aspect ratio keeping image centered and not squished
    const scale = Math.min(128 / img.width, 128 / img.height);
    const x = (128 - img.width * scale) / 2;
    const y = (128 - img.height * scale) / 2;
    
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
    
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = canvas.toDataURL('image/png');
  };
}
