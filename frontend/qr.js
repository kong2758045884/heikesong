import QRCode from "qrcode";
export function qrURL(url) {
  return QRCode.toDataURL(url, {
    width: 360,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#123f37", light: "#ffffff" },
  });
}
