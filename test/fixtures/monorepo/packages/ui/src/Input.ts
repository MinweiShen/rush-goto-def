export interface InputProps {
  placeholder: string;
  value: string;
}

export class Input {
  props: InputProps;
  constructor(props: InputProps) {
    this.props = props;
  }
}
