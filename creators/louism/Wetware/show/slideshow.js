// Fixed start-to-end order from Struktur Wetware, Media, pages 100-101.
export const nuggetScriptQueue = [
  "KEMEJA", "RIASAN", "WANGI-WANGIAN", "GANGGUAN FINANSIAL", "TATA BAHASA INDONESIA",
  "SEKOLAH CHICKEN NUGGET", "IJAZAH CHICKEN NUGGET", "PENGALAMAN KERJA CHICKEN NUGGET", "RELASI CHICKEN NUGGET",
  "LAPANGAN KERJA CHICKEN NUGGET", "GELAR SARJANA CHICKEN NUGGET (S.Cn)", "NIKAH", "PASANGAN", "CERAI", "SEX", "ANAK SKENA",
  "CARI UANG", "INTERNET", "SELURUH DUNIA", "KESET BULE", "PENGANGGURAN", "ANIME ISEKAI",
  "MCU", "ALKOHOL", "BABI", "PROTEIN", "GULA", "TEPUNG", "SAYUR HIJAU", "TEUR REBUS",
  "SAUS", "BEKARYA", "TEATER", "SEDIH", "GOKIL", "PERTANYAAN", "MOTIF", "TEMA",
  "WACANA", "DARURAT", "LIFE-CHANGING", "GAK BERARTI", "TUHAN"
];

export const slideshowVocabulary = nuggetScriptQueue;

export function nuggetPopTransition(elapsedMs) {
  const t = Math.max(0, Math.min(1, (Number(elapsedMs) || 0) / 320));
  const opacity = Math.min(1, t / .35);
  if (t < .55) {
    const rise = t / .55;
    return { opacity, scale:.94 + .08 * (1 - Math.pow(1 - rise, 3)) };
  }
  const settle = (t - .55) / .45;
  return { opacity, scale:1.02 - .02 * (settle * (2 - settle)) };
}

const files = [
  "01-kemeja.png", "02-riasan.png", "03-wangi-wangian.png", "04-gangguan-finansial.png",
  "05-tata-bahasa-indonesia.png", "06-sekolah-chicken-nugget.png", "07-ijazah-chicken-nugget.png",
  "08-pengalaman-kerja-chicken-nugget.png", "09-relasi-chicken-nugget.png",
  "10-lapangan-kerja-chicken-nugget.png", "11-gelar-sarjana-chicken-nugget-scn.png",
  "12-nikah.png", "13-pasangan.png", "14-cerai.png", "15-sex.png", "16-anak-skena.png",
  "17-cari-uang.png", "18-internet.png", "19-seluruh-dunia.png", "20-keset-bule.png",
  "21-pengangguran.png", "22-anime-isekai.png", "23-mcu.png", "24-alkohol.png", "25-babi.png",
  "26-protein.png", "27-gula.png", "28-tepung.png", "29-sayur-hijau.png", "30-teur-rebus.png",
  "31-saus.png", "32-bekarya.png", "33-teater.png", "34-sedih.png", "35-gokil.png",
  "36-pertanyaan.png", "37-motif.png", "38-tema.png", "39-wacana.png", "40-darurat.png",
  "41-life-changing.png", "42-gak-berarti.png", "43-tuhan-cross.png"
];

export const nuggetSlideCandidates = slideshowVocabulary.map((text, index) => ({ text, file:files[index] }));

export function productionNuggetSlideshow() {
  return {
    slides:nuggetSlideCandidates.map(({ text, file }) => {
      const finalSequence = text === "TUHAN";
      return {
        text,
        image:file,
        background:"#000000",
        foreground:finalSequence ? "#71ff4b" : "#f6edf0",
        fit:"contain",
        zoom:finalSequence
      };
    })
  };
}
