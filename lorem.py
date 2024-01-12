import os
from lorem_text import lorem


def generate_lorem_ipsum(length):
    markdown_text = ""
    paragraphs = (
        length // 5
    )  # Assuming each paragraph has 5 sentences in lorem ipsum text
    for _ in range(paragraphs):
        paragraph = lorem.paragraph()
        markdown_text += f"{paragraph}\n\n"

    return markdown_text


def create_markdown_file(file_path, length):
    directory = os.path.dirname(file_path)

    # If the directory does not exist, create it
    if not os.path.exists(directory):
        os.makedirs(directory)

    markdown_text = generate_lorem_ipsum(length)
    with open(file_path, "w") as file:
        file.write(markdown_text)


# Example usage
# create_markdown_file("text/lorem_ipsum.md", 500)  # Generate a 500-word markdown file


def create_markdown_files(number):
    for i in range(number):
        create_markdown_file("text/lorem_ipsum_" + str(i) + ".md", 500)


create_markdown_files(500)
