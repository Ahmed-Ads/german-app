# Documentation of German TTS Voices (توثيق الأصوات الألمانية المعتمدة)

This document provides evidence and official references for the German text-to-speech (TTS) voice names used in the voice selection module of **Deutsch Lernen PWA**.

---

## 1. Verified German Male Voice Names (الأصوات الرجالية المعتمدة مع المصادر الرسمية)

Each name is matched case-insensitively as a substring in `SpeechSynthesisVoice.name`.

| Voice Substring | Platform / Provider | Voice Type / Model | Official Reference / Documentation URL |
| :--- | :--- | :--- | :--- |
| **`stefan`** | Microsoft Windows Desktop / SAPI 5 | Local SAPI Voice (`de-DE, Stefan, Apollo`) | [Microsoft Speech Platform Runtime 11 Documentation](https://learn.microsoft.com/en-us/previous-versions/office/developer/speech-technologies/hh361572(v=office.14)) |
| **`conrad`** | Microsoft Azure / Windows Edge | Neural Voice (`de-DE-ConradNeural`, Male) | [Microsoft Learn Azure AI Speech Language Support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts) |
| **`markus`** | Apple macOS / iOS / iPadOS | Native German Male Voice (`Markus`) | [Apple Accessibility - Spoken Content & VoiceOver](https://support.apple.com/guide/iphone/hear-iphone-speak-iph96b214f0/ios) |
| **`martin`** | Apple macOS / iOS | Native German Male Voice (`Martin`, `de-DE`) | [Apple Developer AVFoundation `AVSpeechSynthesisVoice`](https://developer.apple.com/documentation/avfoundation/avspeechsynthesisvoice) |
| **`yannick`** | Apple macOS / iOS | Native German Male Voice (`Yannick`, `de-DE`) | [Apple Accessibility Spoken Content Voices](https://support.apple.com/guide/mac-help/change-the-voice-your-mac-uses-to-speak-text-mchlp2290/mac) |
| **`killian`** | Microsoft Azure / Edge | Neural Voice (`de-DE-KillianNeural`, Male) | [Microsoft Learn Azure AI Speech Language Support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts) |
| **`klaus`** | Microsoft Azure | Neural Voice (`de-DE-KlausNeural`, Male) | [Microsoft Learn Azure AI Speech Language Support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts) |
| **`ralf`** | Microsoft Azure | Neural Voice (`de-DE-RalfNeural`, Male) | [Microsoft Learn Azure AI Speech Language Support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts) |
| **`christoph`** | Microsoft Azure | Neural Voice (`de-DE-ChristophNeural` / `de-AT-ChristophNeural`, Male) | [Microsoft Learn Azure AI Speech Language Support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts) |
| **` male`**, **`(male)`**, **`_male`**, **`männlich`** | Android / Chrome / Vendor TTS | Generic explicit male indicators | Vendor metadata in voice name strings |

---

## 2. Unverified or Non-German Names Dropped (الأسماء المستبعدة لعدم ثبوتها أو عدم ألمانيتها)

The following names were audited and strictly removed:
1. **`daniel`**: Dropped. Verified to be British English (`en-GB`), not German (per Apple AVFoundation documentation).
2. **`lukas`**: Dropped. Verified to be Slovak (`sk-SK-LukasNeural`), not German (per Microsoft Learn Azure Speech documentation).
3. **`florian`**: Dropped. Not listed in standard Microsoft German neural voice catalog.
4. **`hans`**: Dropped. Historical/legacy Ivona voice not part of native platform standard voice distributions.
5. **`bernd`**: Dropped. Third-party aggregator voice not standard on modern OS platforms.

---

## 3. Verified Female German Voices Excluded from Male Ranking (الأصوات النسائية المستبعدة)

The following voices are confirmed female in vendor documentation and are explicitly prevented from matching as male:
`katja`, `hedda`, `anna`, `petra`, `marlene`, `vicki`, `amala`, `seraphina`, `louisa`, `gisela`, `gudrun`, `elke`, `ingrid`, `maja`, `karolin`, `helga`, `zira`, `weiblich`.
