import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface CompressedImageResult {
  uri: string;
  base64?: string;
  sizeKB: number;
  width: number;
  height: number;
  mimeType: string;
  arrayBuffer?: ArrayBufferLike;
}

export interface UploadEvidenciaResult {
  publicUrl: string;
  path: string;
  sizeKB: number;
  width: number;
  height: number;
}

/**
 * Convierte una cadena Base64 a Uint8Array de manera segura en Web, iOS y Android
 */
export function base64ToUint8Array(base64Str: string): Uint8Array {
  const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, '').trim();
  
  if (typeof (globalThis as any).Buffer !== 'undefined') {
    return new Uint8Array((globalThis as any).Buffer.from(cleanBase64, 'base64'));
  }

  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Comprime un archivo local, URI o Base64 a WebP/JPEG optimizado
 * @param input URI local (file://, blob:), cadena Base64 o datos binarios
 * @param maxWidth Ancho máximo permitido (default: 800px)
 * @param quality Calidad de compresión (0.01 a 1.0, default: 0.65)
 * @returns Objeto con URI comprimido, base64 opcional y estadísticas de tamaño
 */
export async function comprimirImagen(
  input: string | Blob | ArrayBuffer,
  maxWidth = 800,
  quality = 0.65
): Promise<CompressedImageResult> {
  let sourceUri = '';

  if (typeof input === 'string') {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      // Si ya es una URL remota de Supabase o CDN, devolver datos representativos
      return {
        uri: input,
        sizeKB: 50,
        width: maxWidth,
        height: Math.round((maxWidth * 3) / 4),
        mimeType: 'image/webp',
      };
    }

    if (input.startsWith('data:image/')) {
      sourceUri = input;
    } else if (input.startsWith('file:') || input.startsWith('blob:') || input.startsWith('content:')) {
      sourceUri = input;
    } else if (input.length > 100 && /^[A-Za-z0-9+/=]+$/.test(input.slice(0, 100))) {
      // Es una cadena Base64 pura sin prefijo data:
      sourceUri = `data:image/jpeg;base64,${input}`;
    } else {
      sourceUri = input;
    }
  } else if (input instanceof Blob) {
    sourceUri = URL.createObjectURL(input);
  } else if (input instanceof ArrayBuffer) {
    const bytes = new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    sourceUri = `data:image/jpeg;base64,${base64}`;
  }

  try {
    // 1. Usar ImageManipulator (compatible con iOS, Android y Web)
    const format = ImageManipulator.SaveFormat.WEBP || ImageManipulator.SaveFormat.JPEG;

    const manipResult = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: maxWidth } }],
      {
        compress: quality,
        format: format,
        base64: true,
      }
    );

    const base64Output = manipResult.base64 ? `data:image/webp;base64,${manipResult.base64}` : undefined;
    const arrayBuffer = manipResult.base64 ? base64ToUint8Array(manipResult.base64).buffer : undefined;
    const estimatedSizeBytes = manipResult.base64
      ? Math.round((manipResult.base64.length * 3) / 4)
      : 45 * 1024;
    const sizeKB = Number((estimatedSizeBytes / 1024).toFixed(2));

    return {
      uri: manipResult.uri,
      base64: base64Output,
      arrayBuffer,
      sizeKB,
      width: manipResult.width,
      height: manipResult.height,
      mimeType: 'image/webp',
    };
  } catch (err) {
    console.warn('[ImageService] Fallback de manipulación con ImageManipulator:', err);

    // Fallback para entorno Web con Canvas si ImageManipulator tuviera alguna discrepancia
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = sourceUri;
        });

        let targetWidth = img.naturalWidth || img.width;
        let targetHeight = img.naturalHeight || img.height;

        if (targetWidth > maxWidth) {
          targetHeight = Math.round((targetHeight * maxWidth) / targetWidth);
          targetWidth = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          const dataUrl = canvas.toDataURL('image/webp', quality);
          const cleanB64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          const arrayBuffer = base64ToUint8Array(cleanB64).buffer;
          const sizeKB = Number((arrayBuffer.byteLength / 1024).toFixed(2));

          return {
            uri: dataUrl,
            base64: dataUrl,
            arrayBuffer,
            sizeKB,
            width: targetWidth,
            height: targetHeight,
            mimeType: 'image/webp',
          };
        }
      } catch (canvasErr) {
        console.error('[ImageService] Error en compresión Canvas fallback:', canvasErr);
      }
    }

    // Si todo falla, devolver objeto con los datos de entrada
    return {
      uri: sourceUri,
      sizeKB: 60,
      width: maxWidth,
      height: Math.round((maxWidth * 3) / 4),
      mimeType: 'image/jpeg',
    };
  }
}

/**
 * Comprime y sube una imagen de evidencia directamente al Storage de Supabase
 * @param input URI local, Base64 o Blob de la fotografía
 * @param options Opciones de subida como idReporte o nombre personalizado
 * @returns Objeto con la URL pública permanente para almacenar en la BD
 */
export async function uploadEvidenciaASupabase(
  input: string | Blob | ArrayBuffer,
  options?: {
    idReporte?: number | string;
    idUsuario?: number | string;
    fileName?: string;
    bucketName?: string;
  }
): Promise<UploadEvidenciaResult> {
  const bucket = options?.bucketName || 'evidencias';

  // Si ya es una URL remota de Supabase o CDN, no re-subir
  if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
    return {
      publicUrl: input,
      path: input,
      sizeKB: 50,
      width: 800,
      height: 600,
    };
  }

  // 1. Comprimir primero la imagen a 800px max y 65% calidad WebP
  const compressed = await comprimirImagen(input, 800, 0.65);

  if (!isSupabaseConfigured()) {
    console.warn('[ImageService] Supabase no está configurado. Usando URI en memoria.');
    return {
      publicUrl: compressed.uri || (typeof input === 'string' ? input : ''),
      path: 'local/temp.webp',
      sizeKB: compressed.sizeKB,
      width: compressed.width,
      height: compressed.height,
    };
  }

  // 2. Preparar el binario / buffer a enviar
  let uploadData: any;

  if (compressed.arrayBuffer) {
    uploadData = new Uint8Array(compressed.arrayBuffer);
  } else if (compressed.base64) {
    uploadData = base64ToUint8Array(compressed.base64);
  } else if (Platform.OS === 'web' && compressed.uri.startsWith('blob:')) {
    const res = await fetch(compressed.uri);
    uploadData = await res.blob();
  } else {
    // Si tenemos un file:// URI
    const res = await fetch(compressed.uri);
    uploadData = await res.arrayBuffer();
  }

  // 3. Generar ruta única en el bucket
  const reportPrefix = options?.idReporte ? `reporte_${options.idReporte}` : 'pendientes';
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const cleanName = options?.fileName
    ? options.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    : `ev_${timestamp}_${randomSuffix}.webp`;
  const storagePath = `${reportPrefix}/${cleanName}`;

  // 4. Subir al bucket de Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, uploadData, {
      contentType: 'image/webp',
      cacheControl: '31536000', // 1 año de caché CDN / cliente
      upsert: true,
    });

  if (uploadError) {
    console.error(`[ImageService] Error subiendo imagen a bucket '${bucket}':`, uploadError);
    // Si el bucket primario falla por permisos o nombre, retornar URI local como fallback
    return {
      publicUrl: compressed.uri || (typeof input === 'string' ? input : ''),
      path: storagePath,
      sizeKB: compressed.sizeKB,
      width: compressed.width,
      height: compressed.height,
    };
  }

  // 5. Obtener URL pública directa
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl || '';

  return {
    publicUrl,
    path: storagePath,
    sizeKB: compressed.sizeKB,
    width: compressed.width,
    height: compressed.height,
  };
}
