import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Image, FileText, Video, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MediaNodeData {
  mediaType: 'image' | 'document' | 'video' | 'audio';
  url?: string;
  caption?: string;
  filename?: string;
}

const mediaIcons = {
  image: Image,
  document: FileText,
  video: Video,
  audio: Music,
};

const mediaLabels = {
  image: 'Imagem',
  document: 'Documento',
  video: 'Vídeo',
  audio: 'Áudio',
};

function MediaNode({ data, selected }: NodeProps<MediaNodeData>) {
  const Icon = mediaIcons[data.mediaType || 'image'];
  const label = mediaLabels[data.mediaType || 'image'];

  return (
    <div
      className={cn(
        'min-w-[200px] max-w-[280px] rounded-lg border-2 bg-card shadow-md transition-all',
        selected ? 'border-cyan-500 shadow-lg' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-cyan-500 !bg-background"
      />
      
      <div className="flex items-center gap-2 border-b border-border bg-cyan-500/10 px-3 py-2 rounded-t-lg">
        <Icon className="h-4 w-4 text-cyan-600" />
        <span className="text-sm font-medium text-foreground">Mídia: {label}</span>
      </div>
      
      <div className="p-3 space-y-2">
        {data.url ? (
          <div className="text-xs text-muted-foreground truncate">
            📎 {data.filename || data.url}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Nenhum arquivo selecionado
          </p>
        )}
        {data.caption && (
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {data.caption}
          </p>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-cyan-500 !bg-background"
      />
    </div>
  );
}

export default memo(MediaNode);
