import sys

def divide_two_numbers(num1, num2):
    try:
        result = num1 / num2
        return result
    except ZeroDivisionError:
        print("Error: Division by zero is not allowed.", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python divide_numbers.py <number1> <number2>", file=sys.stderr)
        sys.exit(1)
    
    try:
        num1 = float(sys.argv[1])
        num2 = float(sys.argv[2])
    except ValueError:
        print("Error: Please provide valid numbers as input.", file=sys.stderr)
        sys.exit(1)
    
    result = divide_two_numbers(num1, num2)
    print(f"{num1} / {num2} = {result:.2f}")
