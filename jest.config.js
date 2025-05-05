module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\.ts$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|(\.|/)(test|spec))\.[jt]sx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
