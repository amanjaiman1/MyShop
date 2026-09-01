"use client";

import * as React from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { ProductThumb } from "@/components/common/product-thumb";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useShop } from "@/components/providers/shop-provider";
import { validateUpload } from "@/lib/schemas";
import { uuid } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Product image uploader.
 *
 * Uploads to the public `product-images` bucket under the owner's folder
 * (`<uid>/<uuid>.<ext>`), which is exactly what the Storage RLS policy pins to
 * the caller. Type and size are validated client-side before upload; Storage
 * enforces the same limits again server-side.
 */
export function ImageUpload({
  value,
  name,
  onChange,
}: {
  value: string | null;
  name: string;
  onChange: (url: string | null) => void;
}) {
  const { ownerId } = useShop();
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const problem = validateUpload(file, "image");
    if (problem) {
      toast.error(problem);
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${ownerId}/${uuid()}.${ext}`;

      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (error) {
        toast.error("Upload failed. Please try again.");
        return;
      }

      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Image uploaded");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <ProductThumb src={value} name={name || "New product"} size="lg" />

      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <ImagePlus aria-hidden />
            )}
            {value ? "Replace image" : "Upload image"}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              onClick={() => onChange(null)}
              aria-label="Remove image"
            >
              <X className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted">JPEG, PNG, WebP or AVIF · up to 5 MB.</p>
      </div>
    </div>
  );
}
