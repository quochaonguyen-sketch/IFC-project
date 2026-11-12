"""Regenerate bundled rider MP3s: pip install gTTS; python scripts/rider-voice.py."""
from io import BytesIO
from pathlib import Path
import time
from gtts import gTTS

PROMPTS = {
    "welcome": "Xin chào bác tài. Bạn làm theo hướng dẫn trên màn hình để đăng ký lấy hàng nhé.",
    "codes": "Bạn vui lòng nhập ba ký tự cuối đơn hàng, rồi bấm Thêm đơn.",
    "review": "Bạn kiểm tra lại các mã đã nhập, rồi bấm Xác nhận để lấy số thứ tự nhé.",
    "receipt": "Số thứ tự của bạn là",
    "wait": "Bạn vui lòng chờ nhân viên gọi số nhé.",
    "added": "Đã thêm đơn. Bạn nhập đơn tiếp theo, hoặc bấm Kết thúc nhé.",
    "ambiguous": "Có nhiều đơn trùng mã cuối. Bạn nhập thêm ký tự phía trước nhé.",
    "error": "Bạn kiểm tra lại thông báo trên màn hình, hoặc bấm Gọi hỗ trợ nhé.",
    "duplicate": "Bạn đã nhập đơn này rồi. Bạn nhập đơn khác, hoặc bấm Kết thúc nhé.",
    "ready": "Đơn hàng đã sẵn sàng. Bạn nhận hàng theo hướng dẫn của nhân viên nhé.",
}
PROMPTS.update({f"n{i}": word for i, word in enumerate(
    ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]
)})

def main():
    output = Path(__file__).resolve().parents[1] / "public" / "voice"
    output.mkdir(parents=True, exist_ok=True)
    for name, text in PROMPTS.items():
        for attempt in range(2):
            try:
                audio = BytesIO()
                gTTS(text, lang="vi", timeout=(5, 15)).write_to_fp(audio)
                data = audio.getvalue()
                if len(data) < 1024:
                    raise ValueError(f"Empty speech file: {name}")
                (output / f"rider-{name}.mp3").write_bytes(data)
                print(f"Generated rider-{name}.mp3", flush=True)
                break
            except Exception:
                if attempt:
                    raise
                time.sleep(1)

if __name__ == "__main__":
    main()
