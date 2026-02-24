import { capitalize } from '@monorepo/utils';

export interface ButtonProps {
  label: string;
  onClick: () => void;
}

export function Button(props: ButtonProps): string {
  return capitalize(props.label);
}

export default Button;
