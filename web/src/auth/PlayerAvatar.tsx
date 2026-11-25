// A player's picture: the photo of the fighter they chose as their avatar, or their initial.
// The model's account shows the site's logo instead. Fighter photos come from the predictor's
// data, loaded only when there's an avatar to show.

import { Avatar, type AvatarProps } from "@mantine/core";
import { useMemo } from "react";

import { usePredictor } from "../data/client";
import { MODEL_PLAYER } from "../features/pickem/scoring";

interface Props extends Omit<AvatarProps, "src"> {
  name: string;
  avatar: string | null | undefined; // a fighter's public id
}

// The logo on its dark tile, so it reads on any background.
const MODEL_LOGO = `${import.meta.env.BASE_URL}favicon.svg`;

export function PlayerAvatar({ name, avatar, ...props }: Props) {
  const { data } = usePredictor(!!avatar);
  const photo = useMemo(() => (avatar ? data?.fighters.find((f) => f.id === avatar)?.image?.url : undefined), [data, avatar]);
  const url = photo ?? (name === MODEL_PLAYER ? MODEL_LOGO : undefined);
  return (
    <Avatar src={url} radius="xl" color="red" variant="filled" alt={name} {...props}>
      {name.slice(0, 1).toUpperCase()}
    </Avatar>
  );
}
