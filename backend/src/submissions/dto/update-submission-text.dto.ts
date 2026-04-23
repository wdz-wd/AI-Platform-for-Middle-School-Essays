import { IsString, MinLength } from 'class-validator';

export class UpdateSubmissionTextDto {
  @IsString()
  @MinLength(20)
  text!: string;
}
