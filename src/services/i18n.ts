import { Language } from '../types';

export const translations = {
  vi: {
    appTitle: 'TeleCloud',
    tagline: 'Biến Telegram thành Google Drive không giới hạn',
    storageUnlimited: 'Dung lượng không giới hạn',
    storageSubtext: 'Được hỗ trợ bởi hạ tầng Telegram MTProto',
    usedOfUnlimited: 'đã tải lên Telegram',
    clientSideOnly: '100% Client-Side • Không lưu trên server',
    securityBadge: 'Mã hoá đầu cuối khả dụng • Trực tiếp MTProto',
    
    // Sidebar
    newButton: 'Mới',
    uploadFile: 'Tải file lên (tối đa 2GB)',
    uploadFolder: 'Tải thư mục lên',
    newFolder: 'Tạo thư mục mới',
    uploadEncrypted: 'Tải lên mã hoá (AES-256)',
    myDrive: 'Tất cả file',
    starred: 'Đã gắn dấu sao',
    trash: 'Thùng rác',
    smartFolders: 'Thư mục thông minh',
    photos: 'Ảnh & Đồ hoạ',
    videos: 'Video & Phim',
    documents: 'Tài liệu & PDF',
    audios: 'Âm thanh & Nhạc',
    archives: 'Tệp nén & ZIP',
    codes: 'Mã nguồn & Scripts',
    
    // Storage Destinations
    storageLocation: 'Kênh lưu trữ',
    savedMessages: 'Saved Messages (Tin nhắn đã lưu)',
    personalChannel: 'Kênh riêng tư của bạn',
    workGroup: 'Nhóm làm việc & Backup',
    addChannel: '+ Thêm kênh/nhóm mới',
    
    // Toolbar & Search
    searchPlaceholder: 'Tìm kiếm file, tài liệu trong Telegram Drive...',
    filterType: 'Loại file',
    filterSize: 'Kích thước',
    filterDate: 'Thời gian',
    allFiles: 'Tất cả',
    sortBy: 'Sắp xếp theo',
    sortName: 'Tên file',
    sortDate: 'Ngày cập nhật',
    sortSize: 'Kích thước file',
    grid: 'Lưới',
    list: 'Danh sách',
    itemsCount: 'mục',
    
    // File Card & Actions
    foldersTitle: 'Thư mục',
    filesTitle: 'Tệp tin',
    preview: 'Xem trước',
    download: 'Tải về',
    forward: 'Chuyển tiếp Telegram',
    share: 'Chia sẻ liên kết',
    rename: 'Đổi tên',
    star: 'Gắn dấu sao',
    unstar: 'Bỏ gắn dấu sao',
    delete: 'Xoá',
    restore: 'Khôi phục',
    deleteForever: 'Xoá vĩnh viễn',
    info: 'Chi tiết tệp',
    dropFilesHere: 'Thả file vào đây để tải lên Telegram Drive',
    dropFilesSub: 'Hỗ trợ file lên tới 2GB mỗi tệp • 100% Client-side',
    
    // Modals
    qrLoginTitle: 'Đăng nhập Telegram bằng mã QR',
    qrLoginStep1: 'Mở ứng dụng Telegram trên điện thoại',
    qrLoginStep2: 'Vào Cài đặt (Settings) > Thiết bị (Devices)',
    qrLoginStep3: 'Nhấn "Liên kết thiết bị Desktop" và quét mã này',
    simulatedScanBtn: 'Mô phỏng Quét mã QR (Đăng nhập ngay)',
    orManualToken: 'Hoặc đăng nhập bằng Telegram Bot Token / Session',
    accountConnected: 'Đã kết nối Telegram',
    logout: 'Đăng xuất',
    demoNotice: 'Đang dùng tài khoản Demo với phiên bản MTProto mô phỏng',
    
    // Upload Manager
    uploadingTitle: 'Trình quản lý tải lên',
    filesRemaining: 'tệp đang xử lý',
    speed: 'Tốc độ',
    timeLeft: 'Còn lại',
    completed: 'Đã hoàn thành',
    
    // Forward Modal
    forwardTitle: 'Chuyển tiếp file đến Telegram',
    selectRecipient: 'Chọn Kênh / Nhóm / Liên hệ nhận:',
    addComment: 'Thêm lời nhắn / Caption (tuỳ chọn):',
    forwardBtn: 'Chuyển tiếp ngay',
    forwardSuccess: 'Đã chuyển tiếp file thành công!',
    
    // Share Modal
    shareTitle: 'Chia sẻ file từ Telegram Drive',
    shareSub: 'Tạo liên kết trực tiếp để gửi cho bạn bè mà không cần chuyển tiếp qua chat',
    copyLink: 'Sao chép link',
    copied: 'Đã chép vào clipboard!',
    directTelegramLink: 'Link gốc tin nhắn Telegram',
    
    // Security info
    securityTitle: 'Tại sao TeleCloud an toàn 100%?',
    securityDirectConnection: 'Trình duyệt kết nối trực tiếp đến MTProto của Telegram, không có bất kỳ server trung gian nào thu thập dữ liệu của bạn.',
    securityIndexedDb: 'Dữ liệu chỉ lưu cục bộ trên IndexedDB của trình duyệt máy bạn.',
  },
  en: {
    appTitle: 'TeleCloud',
    tagline: 'Turn Telegram into Unlimited Google Drive',
    storageUnlimited: 'Unlimited Cloud Storage',
    storageSubtext: 'Powered by Telegram MTProto infrastructure',
    usedOfUnlimited: 'uploaded to Telegram',
    clientSideOnly: '100% Client-Side • No intermediary server',
    securityBadge: 'End-to-End Encryption Available • Direct MTProto',
    
    // Sidebar
    newButton: 'New',
    uploadFile: 'Upload File (up to 2GB)',
    uploadFolder: 'Upload Folder',
    newFolder: 'New Folder',
    uploadEncrypted: 'Encrypted Upload (AES-256)',
    myDrive: 'All Files',
    starred: 'Starred',
    trash: 'Trash',
    smartFolders: 'Smart Folders',
    photos: 'Photos & Images',
    videos: 'Videos & Movies',
    documents: 'Documents & PDFs',
    audios: 'Audio & Music',
    archives: 'Archives & ZIPs',
    codes: 'Source Code & Scripts',
    
    // Storage Destinations
    storageLocation: 'Storage Destination',
    savedMessages: 'Saved Messages',
    personalChannel: 'Personal Private Channel',
    workGroup: 'Work & Backup Group',
    addChannel: '+ Add New Channel/Group',
    
    // Toolbar & Search
    searchPlaceholder: 'Search files and documents in Telegram Drive...',
    filterType: 'File Type',
    filterSize: 'File Size',
    filterDate: 'Date Modified',
    allFiles: 'All',
    sortBy: 'Sort by',
    sortName: 'File Name',
    sortDate: 'Date Modified',
    sortSize: 'File Size',
    grid: 'Grid',
    list: 'List',
    itemsCount: 'items',
    
    // File Card & Actions
    foldersTitle: 'Folders',
    filesTitle: 'Files',
    preview: 'Preview',
    download: 'Download',
    forward: 'Forward to Telegram',
    share: 'Share Link',
    rename: 'Rename',
    star: 'Star',
    unstar: 'Unstar',
    delete: 'Delete',
    restore: 'Restore',
    deleteForever: 'Delete forever',
    info: 'File Details',
    dropFilesHere: 'Drop files here to upload to Telegram Drive',
    dropFilesSub: 'Supports up to 2GB per file • 100% Client-side',
    
    // Modals
    qrLoginTitle: 'Log in to Telegram via QR Code',
    qrLoginStep1: 'Open Telegram on your phone',
    qrLoginStep2: 'Go to Settings > Devices',
    qrLoginStep3: 'Tap "Link Desktop Device" and scan this QR code',
    simulatedScanBtn: 'Simulate QR Scan (Instant Login)',
    orManualToken: 'Or login with Telegram Bot Token / Session',
    accountConnected: 'Telegram Connected',
    logout: 'Log Out',
    demoNotice: 'Running with Demo Telegram account & simulated MTProto',
    
    // Upload Manager
    uploadingTitle: 'Upload Manager',
    filesRemaining: 'files in progress',
    speed: 'Speed',
    timeLeft: 'Remaining',
    completed: 'Completed',
    
    // Forward Modal
    forwardTitle: 'Forward File to Telegram',
    selectRecipient: 'Select destination Channel / Group / Chat:',
    addComment: 'Add a message or caption (optional):',
    forwardBtn: 'Forward Now',
    forwardSuccess: 'File forwarded successfully!',
    
    // Share Modal
    shareTitle: 'Share File from Telegram Drive',
    shareSub: 'Generate direct links for friends without opening Telegram chats',
    copyLink: 'Copy Link',
    copied: 'Copied to clipboard!',
    directTelegramLink: 'Direct Telegram Message URL',
    
    // Security info
    securityTitle: 'Why is TeleCloud 100% Secure?',
    securityDirectConnection: 'Your browser communicates directly to Telegram MTProto servers with zero middleman.',
    securityIndexedDb: 'All directory indices and session tokens reside strictly in your local browser IndexedDB.',
  }
};

export function detectLanguage(): Language {
  if (typeof window !== 'undefined' && window.navigator) {
    const lang = window.navigator.language.toLowerCase();
    if (lang.startsWith('vi')) return 'vi';
  }
  return 'vi'; // default to Vietnamese as requested by the user prompt
}
