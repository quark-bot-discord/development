import chalk from "chalk";

export class Logger {
  static info(message: string): void {
    console.log(chalk.blue(message));
  }

  static success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  static warning(message: string): void {
    console.log(chalk.yellow(`⚠ ${message}`));
  }

  static error(message: string): void {
    console.error(chalk.red(`✖ ${message}`));
  }

  static step(step: number, total: number, message: string): void {
    console.log(chalk.cyan(`[${step}/${total}] ${message}`));
  }
}