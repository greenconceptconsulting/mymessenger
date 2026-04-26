export async function uploadToCloudinary(file: File | Blob, forceType?: "image" | "video" | "audio"): Promise<{ url: string; type: "image" | "video" | "audio" }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

  const mimeType = file instanceof File ? file.type : (file as Blob).type;
  const resourceType = forceType === "audio" ? "video" // Cloudinary uses "video" endpoint for audio
    : forceType === "video" ? "video"
    : forceType === "image" ? "image"
    : mimeType.startsWith("video") ? "video"
    : "image";

  const returnType: "image" | "video" | "audio" = forceType ?? (mimeType.startsWith("video") ? "video" : "image");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    { method: "POST", body: formData }
  );
  const data = await res.json();
  if (!data.secure_url) throw new Error("Échec de l'upload");
  return { url: data.secure_url, type: returnType };
}
