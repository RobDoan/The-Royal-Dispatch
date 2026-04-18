// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Vietnamese (`vi`).
class AppLocalizationsVi extends AppLocalizations {
  AppLocalizationsVi([String locale = 'vi']) : super(locale);

  @override
  String get appTitle => 'Thư Từ Công Chúa';

  @override
  String get appSubtitle => 'Thư của em đã đến rồi';

  @override
  String appWriting(String princess) {
    return '$princess đang viết thư cho em...';
  }

  @override
  String get goBack => 'Quay Lại';

  @override
  String get royalChallenge => 'Thử Thách Hoàng Gia';

  @override
  String lifeLesson(String princess) {
    return '$princess đang viết bài học cho em...';
  }

  @override
  String get pickChildHeading => 'Ai đọc tối nay?';

  @override
  String get pickChildSubheading => 'Chạm vào tên của em';

  @override
  String get pairingTitle => 'Kết Nối Thiết Bị';

  @override
  String get pairingHint => 'Nhập mã gia đình';

  @override
  String get pairingConnect => 'Kết Nối';

  @override
  String get pairingError => 'Mã không hợp lệ. Vui lòng thử lại.';

  @override
  String get inboxTitle => 'Hộp Thư';

  @override
  String get storyTitle => 'Câu Chuyện';

  @override
  String storyError(String princess) {
    return 'Thư của $princess đang trên đường đến — thử lại sau một chút';
  }

  @override
  String get holdToExit => 'Giữ để Thoát';

  @override
  String get originElsa => 'Vương quốc Arendelle';

  @override
  String get originBelle => 'Lâu đài phép thuật';

  @override
  String get originCinderella => 'Cung điện hoàng gia';

  @override
  String get originAriel => 'Dưới đáy biển';

  @override
  String get originRapunzel => 'Vương quốc Corona';

  @override
  String get originMoana => 'Đảo Motunui';

  @override
  String get originRaya => 'Kumandra';

  @override
  String get originMirabel => 'Khu vườn phép thuật';

  @override
  String get originChase => 'Vịnh Phiêu Lưu (Chó cảnh sát)';

  @override
  String get originMarshall => 'Vịnh Phiêu Lưu (Chó cứu hỏa)';

  @override
  String get originSkye => 'Vịnh Phiêu Lưu (Chó bay)';

  @override
  String get originRubble => 'Vịnh Phiêu Lưu (Chó xây dựng)';
}
