// "Share" button: makes the share image, shows it, and offers the ways to send it on: the
// phone's share sheet (WhatsApp, Instagram, Reddit...), download, copy image, copy link.

import { Button, Center, Group, Image, Loader, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";

interface Props {
  make: () => Promise<Blob>; // draws the image
  fileName: string; // without extension
  text: string; // goes with the image when shared, before the link
  url: string; // a link that opens the same result
  label?: string;
  fullWidth?: boolean;
}

/** The usual "share" icon: a box with an arrow leaving it. */
export function ShareIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="M7.5 7.5 12 3l4.5 4.5" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

const canCopyImage = () => typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

export function ShareButton({ make, fileName, text, url, label = "Share", fullWidth }: Props) {
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const start = () => {
    setOpen(true);
    setBlob(null);
    setFailed(false);
    setNote(null);
    make().then(setBlob, () => setFailed(true));
  };

  const file = blob && new File([blob], `${fileName}.png`, { type: "image/png" });
  const canShareFile = !!file && !!navigator.canShare?.({ files: [file] });

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], text: `${text} ${url}` });
    } catch {
      // closed the share sheet: nothing to do
    }
  };
  const download = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview;
    a.download = `${fileName}.png`;
    a.click();
  };
  const copyImage = async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setNote("Image copied. Paste it into a post or chat.");
    } catch {
      setNote("Couldn't copy the image here. Use Download instead.");
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied.");
    } catch {
      setNote(url);
    }
  };

  return (
    <>
      <Button
        size="sm"
        fullWidth={fullWidth}
        variant="gradient"
        gradient={{ from: "red.7", to: "red.5", deg: 135 }}
        leftSection={<ShareIcon size={16} />}
        onClick={start}
        style={{ boxShadow: "0 4px 14px rgba(250, 82, 82, 0.22)" }}
      >
        {label}
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} title="Share" centered size="lg">
        <Stack gap="sm">
          {preview ? (
            <Image src={preview} alt="The image to share" radius="md" />
          ) : (
            <Center h={300}>{failed ? <Text c="dimmed">Couldn't make the image. Try again.</Text> : <Loader />}</Center>
          )}
          <Group justify="center" gap="xs">
            {canShareFile && (
              <Button onClick={share} leftSection={<ShareIcon size={16} />}>
                Share…
              </Button>
            )}
            <Button variant={canShareFile ? "light" : "filled"} onClick={download} disabled={!preview}>
              Download
            </Button>
            {canCopyImage() && (
              <Button variant="light" onClick={copyImage} disabled={!blob}>
                Copy image
              </Button>
            )}
            <Button variant="subtle" onClick={copyLink}>
              Copy link
            </Button>
          </Group>
          {note && (
            <Text size="sm" c="dimmed" ta="center">
              {note}
            </Text>
          )}
        </Stack>
      </Modal>
    </>
  );
}
