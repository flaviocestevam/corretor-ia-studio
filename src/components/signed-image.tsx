import { useQuery } from "@tanstack/react-query";
import { getSignedUrl } from "@/lib/storage";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SignedImage({
  path,
  alt,
  className,
  fallbackClassName,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const { data: url, isLoading } = useQuery({
    queryKey: ["signed-url", path],
    queryFn: () => (path ? getSignedUrl(path) : Promise.resolve("")),
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
  });

  if (!path || (!isLoading && !url)) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground rounded-lg border border-dashed",
          fallbackClassName ?? className,
        )}
      >
        <ImageIcon className="h-8 w-8 opacity-40" />
      </div>
    );
  }

  if (!url) return <div className={cn("animate-pulse bg-muted rounded-lg", className)} />;

  return <img src={url} alt={alt} className={cn("object-cover", className)} loading="lazy" />;
}
