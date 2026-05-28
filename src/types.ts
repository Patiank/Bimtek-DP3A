export interface Registration {
  id: string;
  nik: string;
  name: string;
  phone: string;
  address: string;
  kabKota: string;
  color: string;
  ktpBase64?: string;
  registeredAt: string;
  signatureBase64?: string;
  bimtekTitle?: string;
  bimtekId?: string;
  certificateBase64?: string;
  certificateFileName?: string;
  certificateFileType?: string;
  gender?: string;
  isCertificateSent?: boolean;
}

export interface Attendance {
  id: string;
  nik: string;
  name: string;
  day: number;
  signatureBase64: string;
  attendedAt: string;
  bimtekTitle?: string;
  bimtekId?: string;
}

export interface AppSettings {
  id: string;
  eventTitle: string;
  durationDays: number;
  gasLink: string;
  startDate?: string;
  eventLocation?: string;
  cardTemplateBase64?: string;
  certificateTemplateBase64?: string;
  kepalaBidangName?: string;
  kepalaBidangNip?: string;
  originalEventId?: string;
  allowanceAmount?: number;
  targetParticipants?: number;
  isCertificateReleased?: boolean;
  cardTemplateTextColor?: "white" | "black";
  // Custom certificate text positions
  certNoX?: number;
  certNoY?: number;
  certNoSize?: number;
  certNoColor?: string;
  certNameX?: number;
  certNameY?: number;
  certNameSize?: number;
  certNameColor?: string;
  certDateX?: number;
  certDateY?: number;
  certDateSize?: number;
  certDateColor?: string;
  // QR signature certificate validation barcode parameters
  certQrX?: number;
  certQrY?: number;
  certQrSize?: number;
  isCertQrEnabled?: boolean;
}

export type ActiveTab = "home" | "register" | "card" | "absent" | "admin";
