import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, X, Eye } from 'lucide-react';
import type { ReferenceImageManagerProps } from '../types';

export const ReferenceImageManager: React.FC<ReferenceImageManagerProps> = ({
  images,
  onAdd,
  onRemove,
  maxImages,
  isProcessing,
}) => {
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      if (images.length < maxImages) {
        try {
          await onAdd(file);
        } catch (error) {
          console.error('Failed to add image:', error);
        }
      }
    }
    event.target.value = '';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[color:var(--foreground)]">
          <Eye className="w-5 h-5 text-[color:var(--muted-foreground)]" />
          Reference Images ({images.length}/{maxImages})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map(image => (
            <div
              key={image.id}
              className="relative group rounded-lg bg-[color:var(--card)] border border-[color:var(--border)] shadow-sm"
            >
              <img
                src={image.url}
                alt={image.name}
                className="w-full h-32 object-cover rounded-lg border border-[color:var(--border)]"
              />
              <Button
                size="sm"
                variant="destructive"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onRemove(image.id)}
                disabled={isProcessing}
              >
                <X className="w-4 h-4" />
              </Button>
              <div className="absolute bottom-2 left-2 right-2">
                <Badge
                  variant="secondary"
                  className="text-xs truncate bg-[color:var(--muted)] text-[color:var(--muted-foreground)]"
                >
                  {image.name}
                </Badge>
              </div>
            </div>
          ))}

          {images.length < maxImages && (
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[color:var(--border)] rounded-lg cursor-pointer bg-[color:var(--card)] hover:bg-[color:var(--muted)] transition-colors">
              <Upload className="w-8 h-8 text-[color:var(--muted-foreground)]" />
              <span className="text-sm text-[color:var(--muted-foreground)]">Add Image</span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                disabled={isProcessing}
              />
            </label>
          )}
        </div>

        {images.length === 0 && (
          <p className="text-sm text-[color:var(--muted-foreground)] text-center py-4">
            Upload reference images showing your desired design
          </p>
        )}
      </CardContent>
    </Card>
  );
};
