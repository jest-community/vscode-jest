#!/bin/bash

function print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Find and optionally delete unused image files."
    echo
    echo "Options:"
    echo "  -d    Delete the unused image files."
    echo "  -h    Display this help message."
    exit 1
}

# If the -h argument is provided, display usage
if [[ $1 == "-h" ]]; then
    print_usage
fi

# Directory where the images reside
IMAGES_DIR="images"

# Directories to exclude from the search
EXCLUDE_DIRS=("images" ".git" ".node_modules" "out" ".vscode")  # Add any other directories you wish to exclude

# Construct the grep exclude pattern for directories
EXCLUDE_DIR_PATTERN=""
for dir in "${EXCLUDE_DIRS[@]}"; do
    EXCLUDE_DIR_PATTERN="$EXCLUDE_DIR_PATTERN --exclude-dir=$dir"
done
echo EXCLUDE_DIR_PATTERN: $EXCLUDE_DIR_PATTERN

# File types to include in the search
INCLUDE_FILES=("*.ts" "*.json" "*.md")  # Specify the file types you want to search within

# Construct the grep include pattern for files
INCLUDE_FILE_PATTERN=""
for file in "${INCLUDE_FILES[@]}"; do
    INCLUDE_FILE_PATTERN="$INCLUDE_FILE_PATTERN --include=$file"
done
echo INCLUDE_FILE_PATTERN: $INCLUDE_FILE_PATTERN

# Temporary file for storing results
TEMP_FILE="unused_images.txt"

# Empty the temp file in case it already exists
> $TEMP_FILE

# Counter for unused images
UNUSED_COUNT=0

RED='\033[31m'
NC='\033[0m' # No Color

# Iterate over all image files
while read -r img; do
    # Search for the image file in the specified file types and excluding the specified directories
    grep -rl "$img" $EXCLUDE_DIR_PATTERN $INCLUDE_FILE_PATTERN . > /dev/null

    # If grep's exit status is non-zero, then the image is not referenced anywhere
    if [ $? -ne 0 ]; then
        echo "$img" >> $TEMP_FILE
        # Increment the counter
        ((UNUSED_COUNT++))
        echo -e "${RED}$img => not used ($UNUSED_COUNT) ${NC}"
    else
        echo -e "$img => used"
    fi
done < <(find $IMAGES_DIR -type f \( -iname \*.jpg -o -iname \*.jpeg -o -iname \*.png -o -iname \*.gif \))

echo "-------------------------"

# Display the results
if [ -s $TEMP_FILE ]; then
    echo "$UNUSED_COUNT Unused images:"
    cat $TEMP_FILE
    echo "-------------------------"
    
    # If the -d argument is provided, delete the files
    if [[ $1 == "-d" ]]; then
        echo "Deleting unused images..."
        while IFS= read -r img; do
           rm "$img"
        done < $TEMP_FILE
        echo "Unused images deleted."
    fi
else
    echo "No unused images found."
fi

# Clean up the temp file
rm $TEMP_FILE