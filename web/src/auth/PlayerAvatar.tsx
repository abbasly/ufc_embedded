// A player's picture: the photo of the fighter they chose as their avatar, or their initial.
// Fighter photos come from the predictor's data, loaded only when there's an avatar to show.

import { Avatar, type AvatarProps } from "@mantine/core";
import { useMemo } from "react";

import { usePredictor } from "../data/client";

interface Props extends Omit<AvatarProps, "src"> {
  name: string;
  avatar: string | null | undefined; // a fighter's public id
}

export function PlayerAvatar({ name, avatar, ...props }: Props) {
  const { data } = usePredictor(!!avatar);
  const url = useMemo(() => (avatar ? data?.fighters.find((f) => f.id === avatar)?.image?.url : undefined), [data, avatar]);
  return (
    <Avatar src={url} radius="xl" color="red" variant="filled" alt={name} {...props}>
      {name.slice(0, 1).toUpperCase()}
    </Avatar>
  );
}
