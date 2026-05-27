import argparse
import sys
from PIL import Image

def extract_row(input_path, output_path, total_rows, target_row):
    try:
        # 1. 打开图像
        img = Image.open(input_path)
        width, height = img.size
        
        # 2. 基础参数校验
        if target_row >= total_rows or target_row < 0:
            print(f"❌ 错误: 目标行索引 ({target_row}) 超出范围！必须在 0 到 {total_rows - 1} 之间。")
            sys.exit(1)
            
        # 3. 计算高度与裁剪区域
        row_height = height // total_rows
        
        left = 0
        upper = row_height * target_row
        right = width
        lower = row_height * (target_row + 1)
        
        # 4. 执行裁剪
        crop_box = (left, upper, right, lower)
        extracted_row = img.crop(crop_box)
        
        # 5. 保存结果
        extracted_row.save(output_path)
        print(f"✅ 成功！第 {target_row + 1} 行已成功提取并保存至: {output_path}")
        
    except FileNotFoundError:
        print(f"❌ 错误: 找不到输入文件 '{input_path}'，请检查文件名或路径。")
    except Exception as e:
        print(f"❌ 发生未知错误: {e}")

def main():
    # 设置命令行参数解析器
    parser = argparse.ArgumentParser(
        description="🖼️ 从精灵图 (Sprite Sheet) 中提取特定的一行。",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    # 必须提供的参数
    parser.add_argument("-i", "--input", required=True, help="输入图片的文件名/路径")
    parser.add_argument("-o", "--output", required=True, help="输出图片的文件名/路径")
    
    # 可选参数（带有默认值）
    parser.add_argument("-r", "--rows", type=int, default=9, help="图片总共有多少行")
    parser.add_argument("-t", "--target", type=int, default=1, help="要提取的目标行索引 (从0开始算，第2行输入1)")
    
    # 解析参数
    args = parser.parse_args()
    
    # 执行提取逻辑
    extract_row(args.input, args.output, args.rows, args.target)

if __name__ == "__main__":
    main()