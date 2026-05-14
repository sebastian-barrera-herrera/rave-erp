import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDocument, UserDocumentType } from './entities/user-document.entity';
import { User } from './entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { UploadUserDocumentDto } from './dto/user-document.dto';
import { PdfService, EmploymentCertificateData } from '../pdf/pdf.service';

interface UploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8MB — suficiente para PDFs/imágenes típicas.
const ALLOWED_MIME = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
];

/**
 * Documentos asociados a miembros del equipo (incapacidades, afiliaciones,
 * etc.) y certificados generados (laboral) sobre los mismos miembros.
 */
@Injectable()
export class UserDocumentsService {
  constructor(
    @InjectRepository(UserDocument)
    private readonly docRepo: Repository<UserDocument>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly pdfService: PdfService,
  ) {}

  async upload(
    targetUserId: string,
    companyId: string,
    uploaderId: string,
    dto: UploadUserDocumentDto,
    file: UploadFile | undefined,
    canManageOthers: boolean,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('El archivo supera 8 MB');
    }
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Usa PDF, PNG, JPG o WEBP.',
      );
    }

    const user = await this.userRepo.findOne({
      where: { id: targetUserId, company_id: companyId },
    });
    if (!user) throw new NotFoundException('Miembro del equipo no encontrado');

    if (targetUserId !== uploaderId && !canManageOthers) {
      throw new ForbiddenException(
        'Solo puedes cargar documentos para tu propio perfil',
      );
    }

    const doc = this.docRepo.create({
      company_id: companyId,
      user_id: targetUserId,
      uploaded_by_id: uploaderId,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      file_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      data: file.buffer,
      issued_at: dto.issued_at ?? null,
      expires_at: dto.expires_at ?? null,
    } as Partial<UserDocument>);
    const saved = (await this.docRepo.save(doc)) as UserDocument;
    return this.toMetadata(saved);
  }

  async list(
    targetUserId: string,
    companyId: string,
    requesterUserId: string,
    canManageOthers: boolean,
  ) {
    if (targetUserId !== requesterUserId && !canManageOthers) {
      throw new ForbiddenException(
        'No tienes permiso para ver documentos de otros miembros',
      );
    }
    const docs = await this.docRepo.find({
      where: { user_id: targetUserId, company_id: companyId },
      order: { created_at: 'DESC' },
      // Excluimos data del listado.
      select: [
        'id', 'user_id', 'uploaded_by_id', 'type', 'title', 'description',
        'file_name', 'mime_type', 'size', 'issued_at', 'expires_at',
        'created_at', 'updated_at',
      ],
    });
    return docs;
  }

  async download(id: string, companyId: string, requesterUserId: string, canManageOthers: boolean) {
    const doc = await this.docRepo.findOne({
      where: { id, company_id: companyId },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.user_id !== requesterUserId && !canManageOthers) {
      throw new ForbiddenException('No puedes ver documentos de otros miembros');
    }
    return doc;
  }

  async remove(id: string, companyId: string, requesterUserId: string, canManageOthers: boolean) {
    const doc = await this.docRepo.findOne({
      where: { id, company_id: companyId },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.user_id !== requesterUserId && !canManageOthers) {
      throw new ForbiddenException('No puedes eliminar documentos de otros miembros');
    }
    await this.docRepo.softDelete(id);
    return { message: 'Documento eliminado' };
  }

  // ── Certificado laboral del miembro ─────────────────────────────────────
  async generateEmploymentCertificate(
    targetUserId: string,
    companyId: string,
    data: EmploymentCertificateData & { position?: string },
  ): Promise<{ pdf: Buffer; user: User }> {
    const user = await this.userRepo.findOne({
      where: { id: targetUserId, company_id: companyId },
      relations: ['custom_role'],
    });
    if (!user) throw new NotFoundException('Miembro del equipo no encontrado');
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    // Mapeamos al "Customer-like" que entiende el PdfService — un objeto plano
    // con los campos que la plantilla lee.
    const subject = {
      name: user.name,
      document_type: null as any,
      document_number: null as any,
      email: user.email,
      phone: user.phone,
      address: null as any,
    };
    const pdf = await this.pdfService.generateEmploymentCertificate(
      subject as any,
      company,
      data,
    );
    return { pdf, user };
  }

  private toMetadata(doc: UserDocument) {
    const { data, ...meta } = doc as any;
    return meta;
  }
}
