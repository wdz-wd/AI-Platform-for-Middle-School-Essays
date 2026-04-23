import { BadRequestException, Injectable } from '@nestjs/common';
import { FileKind } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

type UploadLike = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

@Injectable()
export class FilesService {
  private readonly baseDir = resolve(
    process.cwd(),
    process.env.UPLOAD_DIR ?? '../uploads',
  );

  async storeTaskTopicFile(taskId: string, file: UploadLike) {
    const normalizedOriginalName = this.normalizeOriginalName(file.originalname);
    const fileKind = this.getFileKind(file);
    const relativePath = `topics/${taskId}/${Date.now()}-${randomUUID()}${extname(normalizedOriginalName).toLowerCase()}`;
    const absolutePath = resolve(this.baseDir, relativePath);

    await mkdir(resolve(absolutePath, '..'), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    return {
      filePath: relativePath,
      fileName: normalizedOriginalName,
      fileType: fileKind,
      absolutePath,
      publicUrl: this.toPublicUrl(relativePath),
    };
  }

  async storeSubmissionFile(taskId: string, file: UploadLike) {
    const normalizedOriginalName = this.normalizeOriginalName(file.originalname);
    const fileKind = this.getFileKind(file);
    const relativePath = `submissions/${taskId}/${Date.now()}-${randomUUID()}${extname(normalizedOriginalName).toLowerCase()}`;
    const absolutePath = resolve(this.baseDir, relativePath);

    await mkdir(resolve(absolutePath, '..'), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    return {
      filePath: relativePath,
      fileName: normalizedOriginalName,
      fileType: fileKind,
      absolutePath,
      publicUrl: this.toPublicUrl(relativePath),
    };
  }

  toPublicUrl(relativePath: string) {
    return `/uploads/${relativePath.replace(/\\/g, '/')}`;
  }

  toAbsolutePath(relativePath: string) {
    return resolve(this.baseDir, relativePath);
  }

  normalizeOriginalName(originalname: string) {
    if (!originalname) {
      return 'unnamed-file';
    }

    try {
      const decoded = Buffer.from(originalname, 'latin1').toString('utf8').trim();
      if (decoded && decoded.includes('\uFFFD') === false) {
        return decoded;
      }
    } catch (_error) {
      // Fallback to original name below.
    }

    return originalname.trim() || 'unnamed-file';
  }

  private getFileKind(file: UploadLike): FileKind {
    const mimetype = file.mimetype.toLowerCase();
    if (mimetype.includes('pdf')) {
      return FileKind.PDF;
    }

    if (mimetype.includes('png')) {
      return FileKind.PNG;
    }

    if (mimetype.includes('jpg') || mimetype.includes('jpeg')) {
      return FileKind.JPG;
    }

    throw new BadRequestException('仅支持 jpg/png/pdf 文件');
  }
}
