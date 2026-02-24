function helperFunction(): string {
  return 'hello';
}

interface MyInterface {
  name: string;
}

const myConst = 42;

export function main() {
  const x = helperFunction();
  const y: MyInterface = { name: x };
  return myConst;
}
