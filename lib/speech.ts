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
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let accumulated = "";
  let stopped = false;

  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        accumulated += event.results[i][0].transcript + " ";
      }
    }
  };

  recognition.onend = () => {
    if (stopped) {
      if (accumulated.trim()) onResult(accumulated.trim());
      onEnd();
    } else {
      // Redémarre si arrêté involontairement (pause iOS)
      try { recognition.start(); } catch {}
    }
  };

  recognition.stop = (function(originalStop) {
    return function() {
      stopped = true;
      originalStop.call(recognition);
    };
  })(recognition.stop.bind(recognition));

  recognition.start();
  return recognition;
}
