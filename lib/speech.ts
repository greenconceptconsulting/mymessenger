export const LANGUAGES = [
  { code: "fr", label: "Français", speechCode: "fr-FR" },
  { code: "zh", label: "Chinois (Mandarin)", speechCode: "zh-CN" },
  { code: "en", label: "Anglais", speechCode: "en-US" },
  { code: "es", label: "Espagnol", speechCode: "es-ES" },
  { code: "ar", label: "Arabe", speechCode: "ar-SA" },
  { code: "de", label: "Allemand", speechCode: "de-DE" },
  { code: "it", label: "Italien", speechCode: "it-IT" },
  { code: "pt", label: "Portugais", speechCode: "pt-PT" },
  { code: "ja", label: "Japonais", speechCode: "ja-JP" },
  { code: "ko", label: "Coréen", speechCode: "ko-KR" },
  { code: "vi", label: "Vietnamien", speechCode: "vi-VN" },
  { code: "th", label: "Thaï", speechCode: "th-TH" },
];

export function speakText(text: string, speechCode: string) {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechCode;
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

export function transcribeAudio(
  speechCode: string,
  onResult: (text: string) => void,
  onEnd: () => void
): any {
  if (typeof window === "undefined") return null;
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const recognition = new SpeechRecognition();
  recognition.lang = speechCode;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript;
    onResult(transcript);
  };
  recognition.onend = onEnd;
  recognition.start();
  return recognition;
}
